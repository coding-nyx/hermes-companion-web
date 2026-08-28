import { attentionPulse, executeTool, speakAssistant } from "./device-api";
import { loopbackPeer, peerFromUrl } from "./discovery";
import { ensureLoopback, loopbackPollPhone, loopbackPushFromPhone, loopbackReset } from "./loopback";
import type { GatewayPeer, WireMsg } from "./protocol";
import { useHermesStore } from "./store";
import { uid } from "@/lib/utils";
import type { ToolArgs } from "./types";

export type LiveLink = {
  peer: GatewayPeer;
  session: string;
  send: (msg: WireMsg) => Promise<void>;
  close: () => void;
};

let live: LiveLink | null = null;
let polling = false;
let reconnecting = false;

export function getLiveLink() {
  return live;
}

export async function connectPeer(peer: GatewayPeer, code: string): Promise<LiveLink> {
  live?.close();
  loopbackReset();

  if (peer.kind === "loopback") {
    ensureLoopback();
    const session = uid("ses");
    const link: LiveLink = {
      peer,
      session,
      send: async (msg) => {
        loopbackPushFromPhone([msg]);
      },
      close: () => {
        if (live === link) {
          live = null;
          useHermesStore.getState().setLinkUp(false);
        }
        polling = false;
      },
    };
    live = link;
    useHermesStore.getState().setLinkUp(true);
    startPoll(link);
    return link;
  }

  const res = await fetch(`${peer.url}/companion/pair`, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      device: {
        name: useHermesStore.getState().device.name,
        model: useHermesStore.getState().device.model,
      },
    }),
  });
  const body = (await res.json()) as { ok?: boolean; session?: string; host?: string; error?: string };
  if (!res.ok || !body.ok || !body.session) {
    throw new Error(body.error || "Pairing rejected");
  }
  const token = body.session;
  const link: LiveLink = {
    peer: { ...peer, label: body.host || peer.label },
    session: token,
    send: async (msg) => {
      await fetch(`${peer.url}/companion/inbox`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: [msg] }),
      });
    },
    close: () => {
      if (live === link) {
        live = null;
        useHermesStore.getState().setLinkUp(false);
      }
      polling = false;
    },
  };
  live = link;
  useHermesStore.getState().setLinkUp(true);
  startPoll(link);
  return link;
}

export async function reconnectFromStore(): Promise<boolean> {
  const s = useHermesStore.getState();
  if (!s.paired) return false;
  if (live && polling) {
    s.setLinkUp(true);
    return true;
  }
  if (reconnecting) return Boolean(live);
  reconnecting = true;
  const loop = loopbackPeer();
  const wantsPlugin = s.connectionKind === "plugin" && s.peerUrl && !s.peerUrl.startsWith("loopback:");
  try {
    if (wantsPlugin) {
      try {
        await connectPeer(peerFromUrl(s.peerUrl, s.gateway), s.pairing);
        return true;
      } catch {
        await connectPeer(loop, s.pairing);
        s.pushActivity({
          kind: "system",
          title: "Tailscale gateway offline",
          detail: "Using the on-device plugin runtime until the box answers",
        });
        return true;
      }
    }
    await connectPeer(loop, s.pairing);
    return true;
  } catch {
    s.setLinkUp(false);
    return false;
  } finally {
    reconnecting = false;
  }
}

export async function pingLive() {
  if (!live) return;
  try {
    await live.send({ type: "ping", t: Date.now() });
  } catch {
    live.close();
  }
}

function startPoll(link: LiveLink) {
  polling = true;
  void (async () => {
    let fails = 0;
    while (polling && live === link) {
      try {
        const batch = await poll(link);
        fails = 0;
        for (const msg of batch) await handleFromGateway(msg);
      } catch {
        fails += 1;
        if (fails > 3) {
          link.close();
          void reconnectFromStore();
          return;
        }
        await sleep(1200);
      }
    }
  })();
}

async function poll(link: LiveLink): Promise<WireMsg[]> {
  if (link.peer.kind === "loopback") return loopbackPollPhone();
  const res = await fetch(`${link.peer.url}/companion/outbox`, {
    method: "GET",
    mode: "cors",
    headers: { Authorization: `Bearer ${link.session}` },
  });
  if (res.status === 401) throw new Error("unpaired");
  if (!res.ok) return [];
  const body = (await res.json()) as { messages?: WireMsg[] };
  return Array.isArray(body.messages) ? body.messages : [];
}

async function handleFromGateway(msg: WireMsg) {
  const store = useHermesStore.getState();
  if (msg.type === "pong") {
    store.setLatency(Math.max(2, Date.now() - msg.t));
    store.bumpPing();
    store.setLinkUp(true);
    return;
  }
  if (msg.type === "assistant") {
    store.appendMessages(store.activeSessionId, [
      { id: msg.id || uid("msg"), role: "assistant", content: msg.text, createdAt: Date.now() },
    ]);
    store.setThinking(false);
    speakAssistant(msg.text);
    return;
  }
  if (msg.type === "tool_call") {
    const name = msg.name.replace(/^companion_/, "");
    const args = (msg.args ?? {}) as ToolArgs;
    const sessionId = store.activeSessionId;
    const tool = { id: msg.id, name, args, status: "running" as const };
    store.appendMessages(sessionId, [
      {
        id: uid("msg"),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        toolCalls: [tool],
      },
    ]);
    const exec = await executeTool(name, args);
    if (exec.needsApproval) {
      store.patchLastAssistantTools(sessionId, [{ ...tool, status: "needs_approval" }]);
      store.setThinking(false);
      store.setApproval({
        id: uid("appr"),
        toolCallId: msg.id,
        name,
        args,
        reason: exec.approvalReason ?? name,
      });
      attentionPulse();
      return;
    }
    store.patchLastAssistantTools(sessionId, [{ ...tool, status: "done", result: exec.result }]);
    store.pushActivity({
      kind: "tool",
      title: name,
      detail: (exec.result || "").slice(0, 140),
    });
    await live?.send({ type: "tool_result", id: msg.id, ok: exec.ok, result: exec.result });
  }
}

export async function sendOverLink(msg: WireMsg) {
  if (!live) throw new Error("not connected");
  await live.send(msg);
}

export function disconnectLink() {
  live?.close();
  live = null;
  polling = false;
  useHermesStore.getState().setLinkUp(false);
}

function sleep(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}
