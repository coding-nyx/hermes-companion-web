import { runAgentTurn } from "./agent";
import { deviceSnapshot } from "./device-api";
import type { HelloPayload, WireMsg } from "./protocol";
import type { AgentApiMessage, ToolArgs } from "./types";
import { uid } from "@/lib/utils";

type Waiter = (msgs: WireMsg[]) => void;

const toPhone: WireMsg[] = [];
const phoneWait: Waiter[] = [];
const rpcWait = new Map<string, (msg: WireMsg) => void>();

let started = false;
let history: AgentApiMessage[] = [];
let running = false;
const queued: string[] = [];

function emitPhone(msg: WireMsg) {
  toPhone.push(msg);
  const waiters = phoneWait.splice(0, phoneWait.length);
  if (waiters.length) {
    const batch = toPhone.splice(0, toPhone.length);
    for (const w of waiters) w(batch);
  }
}

export const LOOPBACK_HELLO: HelloPayload = {
  ok: true,
  name: "companion",
  label: "On-device plugin runtime",
  version: "1.0.0",
  port: 8642,
  magicDns: "hermes.companion",
  tailscaleIps: [],
  pairing: true,
};

export function loopbackPushFromPhone(messages: WireMsg[]) {
  for (const msg of messages) {
    if (msg.type === "tool_result" || msg.type === "approval_response") {
      rpcWait.get(msg.id)?.(msg);
      rpcWait.delete(msg.id);
      continue;
    }
    if (msg.type === "user") void runAsGateway(msg.text);
    if (msg.type === "notify") {
      void runAsGateway(
        `[phone notification] ${msg.app} — ${msg.title}: ${msg.body}\n\nHandle this if needed.`,
      );
    }
    if (msg.type === "ping") emitPhone({ type: "pong", t: msg.t });
    if (msg.type === "device_state") {
      /* snapshot is pulled live when the agent runs */
    }
  }
}

export function loopbackPollPhone(): Promise<WireMsg[]> {
  if (toPhone.length) return Promise.resolve(toPhone.splice(0, toPhone.length));
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      const i = phoneWait.indexOf(resolve);
      if (i >= 0) phoneWait.splice(i, 1);
      resolve(toPhone.splice(0, toPhone.length));
    }, 8000);
    const wrapped: Waiter = (msgs) => {
      window.clearTimeout(timer);
      resolve(msgs);
    };
    phoneWait.push(wrapped);
  });
}

export function ensureLoopback() {
  started = true;
  return started;
}

async function runAsGateway(text: string) {
  queued.push(text);
  if (running) return;
  running = true;
  try {
    while (queued.length) {
      const next = queued.shift()!;
      history.push({ role: "user", content: next });
      history = history.slice(-24);
      let answered = false;
      for (let round = 0; round < 4; round++) {
        const result = await runAgentTurn({
          data: { messages: history, snapshot: deviceSnapshot() },
        });
        if (!result.ok) {
          emitPhone({ type: "assistant", id: uid("msg"), text: result.error });
          answered = true;
          break;
        }
        if (result.toolCalls.length) {
          history.push({
            role: "assistant",
            content: result.content || "",
            tool_calls: result.toolCalls.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) },
            })),
          });
          for (const tool of result.toolCalls) {
            const rpc = await callPhone(tool.id, tool.name, tool.args);
            history.push({
              role: "tool",
              content: rpc,
              tool_call_id: tool.id,
            });
          }
          continue;
        }
        const textOut = result.content || "Done.";
        history.push({ role: "assistant", content: textOut });
        emitPhone({ type: "assistant", id: uid("msg"), text: textOut });
        answered = true;
        break;
      }
      if (!answered) {
        emitPhone({ type: "assistant", id: uid("msg"), text: "Done." });
      }
    }
  } finally {
    running = false;
  }
}

function callPhone(id: string, name: string, args: ToolArgs): Promise<string> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      rpcWait.delete(id);
      resolve("phone timed out");
    }, 45_000);
    rpcWait.set(id, (msg) => {
      window.clearTimeout(timer);
      if (msg.type === "tool_result") resolve(msg.result);
      else resolve("denied");
    });
    emitPhone({ type: "tool_call", id, name, args });
  });
}

export function loopbackReset() {
  history = [];
  running = false;
  queued.length = 0;
  toPhone.length = 0;
  const waiters = phoneWait.splice(0, phoneWait.length);
  for (const w of waiters) w([]);
  rpcWait.clear();
}
