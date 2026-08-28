import { uid } from "@/lib/utils";
import { runAgentTurn } from "./agent";
import { attentionPulse, deviceSnapshot, executeTool, speakAssistant } from "./device-api";
import { getLiveLink, sendOverLink } from "./gateway-client";
import { useHermesStore } from "./store";
import type { AgentApiMessage, ChatMessage, ToolCall } from "./types";

function toApi(messages: ChatMessage[]): AgentApiMessage[] {
  const out: AgentApiMessage[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: m.content || "",
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) },
        })),
      });
      continue;
    }
    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
      });
      continue;
    }
    if (m.role === "user" || m.role === "assistant" || m.role === "system") {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function holdThinking() {
  window.setTimeout(() => {
    if (useHermesStore.getState().thinking) useHermesStore.getState().setThinking(false);
  }, 45_000);
}

export async function sendToHermes(userText: string, opts: { switchTab?: boolean } = {}) {
  const store = useHermesStore.getState();
  if (store.thinking) return;
  const sessionId = store.activeSessionId;
  const userMsg: ChatMessage = {
    id: uid("msg"),
    role: "user",
    content: userText,
    createdAt: Date.now(),
  };
  store.appendMessages(sessionId, [userMsg]);
  store.setThinking(true);
  if (opts.switchTab !== false) store.setTab("chat");

  const link = getLiveLink();
  if (link) {
    try {
      await sendOverLink({ type: "user", id: userMsg.id, text: userText });
    } catch (err) {
      store.appendMessages(sessionId, [
        {
          id: uid("msg"),
          role: "assistant",
          content: err instanceof Error ? err.message : "Gateway unreachable",
          createdAt: Date.now(),
        },
      ]);
      store.setThinking(false);
    }
    holdThinking();
    return;
  }

  try {
    await loop(sessionId);
  } finally {
    useHermesStore.getState().setThinking(false);
  }
}

export async function resumeAfterApproval(approved: boolean) {
  const store = useHermesStore.getState();
  const pending = store.pendingApproval;
  if (!pending) return;
  const sessionId = store.activeSessionId;
  store.setApproval(null);

  const link = getLiveLink();
  if (link) {
    if (!approved) {
      await sendOverLink({
        type: "tool_result",
        id: pending.toolCallId,
        ok: false,
        result: "User denied this action on the companion.",
      });
      store.setThinking(true);
      holdThinking();
      return;
    }
    const exec = await executeTool(pending.name.replace(/^companion_/, ""), pending.args, { preapproved: true });
    await sendOverLink({ type: "tool_result", id: pending.toolCallId, ok: exec.ok, result: exec.result });
    store.setThinking(true);
    holdThinking();
    return;
  }

  const session = store.sessions.find((s) => s.id === sessionId);
  const last = [...(session?.messages ?? [])].reverse().find((m) => m.toolCalls?.length);
  const tools = last?.toolCalls ?? [];
  const target = tools.find((t) => t.id === pending.toolCallId);

  if (!target) return;

  if (!approved) {
    target.status = "denied";
    target.result = "User denied this action.";
    store.patchLastAssistantTools(sessionId, [...tools]);
    store.appendMessages(sessionId, [
      {
        id: uid("msg"),
        role: "tool",
        content: "User denied this action on the companion.",
        createdAt: Date.now(),
        toolName: target.name,
        toolCallId: target.id,
      },
    ]);
    store.setThinking(true);
    try {
      await loop(sessionId);
    } finally {
      useHermesStore.getState().setThinking(false);
    }
    return;
  }

  store.setThinking(true);
  try {
    await runOneTool(sessionId, target, tools, { preapproved: true });
    await loop(sessionId);
  } finally {
    useHermesStore.getState().setThinking(false);
  }
}

async function loop(sessionId: string) {
  for (let round = 0; round < 4; round++) {
    const store = useHermesStore.getState();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const result = await runAgentTurn({
      data: {
        messages: toApi(session.messages),
        snapshot: deviceSnapshot(),
      },
    });

    if (!result.ok) {
      store.appendMessages(sessionId, [
        {
          id: uid("msg"),
          role: "assistant",
          content: result.error,
          createdAt: Date.now(),
        },
      ]);
      return;
    }

    if (result.toolCalls.length) {
      const tools: ToolCall[] = result.toolCalls.map((t) => ({
        id: t.id,
        name: t.name,
        args: t.args,
        status: "pending",
      }));
      store.appendMessages(sessionId, [
        {
          id: uid("msg"),
          role: "assistant",
          content: result.content,
          createdAt: Date.now(),
          toolCalls: tools,
        },
      ]);

      for (const tool of tools) {
        const halt = await runOneTool(sessionId, tool, tools, {});
        if (halt) return;
      }
      continue;
    }

    const text = result.content || (result.local ? "Done." : "");
    if (text) {
      store.appendMessages(sessionId, [
        {
          id: uid("msg"),
          role: "assistant",
          content: text,
          createdAt: Date.now(),
        },
      ]);
      speakAssistant(text);
    }
    return;
  }
}

async function runOneTool(
  sessionId: string,
  tool: ToolCall,
  all: ToolCall[],
  opts: { preapproved?: boolean },
): Promise<boolean> {
  const store = useHermesStore.getState();
  tool.status = "running";
  store.patchLastAssistantTools(sessionId, [...all]);

  const exec = await executeTool(tool.name, tool.args, opts);
  if (exec.needsApproval) {
    tool.status = "needs_approval";
    store.patchLastAssistantTools(sessionId, [...all]);
    store.setApproval({
      id: uid("appr"),
      toolCallId: tool.id,
      name: tool.name,
      args: tool.args,
      reason: exec.approvalReason ?? tool.name,
    });
    attentionPulse();
    return true;
  }

  tool.status = exec.ok ? "done" : "done";
  tool.result = exec.result;
  store.patchLastAssistantTools(sessionId, [...all]);
  store.appendMessages(sessionId, [
    {
      id: uid("msg"),
      role: "tool",
      content: exec.result,
      createdAt: Date.now(),
      toolName: tool.name,
      toolCallId: tool.id,
    },
  ]);
  store.pushActivity({
    kind: "tool",
    title: tool.name,
    detail: (exec.result || "").slice(0, 140),
  });
  return false;
}

export function relayNotifications(ids: string[]) {
  const store = useHermesStore.getState();
  const notes = store.notifications.filter((n) => ids.includes(n.id));
  if (!notes.length) return;
  for (const n of notes) store.markForwarded(n.id);
  const link = getLiveLink();
  if (link) {
    store.setThinking(true);
    holdThinking();
    for (const n of notes) {
      void sendOverLink({
        type: "notify",
        id: n.id,
        app: n.app,
        title: n.title,
        body: n.body,
      });
    }
    return;
  }
  const body = notes
    .map((n) => `• ${n.app} — ${n.title}: ${n.body}`)
    .join("\n");
  void sendToHermes(
    `[phone notification${notes.length > 1 ? "s" : ""} forwarded]\n${body}\n\nHandle these if needed.`,
    { switchTab: false },
  );
}
