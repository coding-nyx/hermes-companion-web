import { createServerFn } from "@tanstack/react-start";
import { HERMES_TOOLS, SYSTEM_PROMPT } from "./catalog";
import type { AgentApiMessage, ToolArgs } from "./types";

export type AgentTurnInput = {
  messages: AgentApiMessage[];
  snapshot: string;
};

export type AgentToolCall = {
  id: string;
  name: string;
  args: ToolArgs;
};

export type AgentTurnResult =
  | {
      ok: true;
      content: string;
      toolCalls: AgentToolCall[];
      local: boolean;
    }
  | { ok: false; error: string };

function parseArgs(raw: string): ToolArgs {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: ToolArgs = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        out[k] = val;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function localReplyFromTools(messages: AgentApiMessage[]): string {
  const tools = messages.filter((m) => m.role === "tool").slice(-8);
  if (!tools.length) return "Done.";
  const chunks: string[] = [];
  for (const t of tools) {
    const c = (t.content ?? "").trim();
    if (!c) continue;
    if (c.startsWith("[") || c.startsWith("{")) {
      try {
        const v = JSON.parse(c) as unknown;
        if (Array.isArray(v)) {
          if (!v.length) {
            chunks.push("Shade is empty.");
          } else {
            const lines = v.map((n) => {
              const x = n as { app?: string; title?: string; body?: string };
              return `• ${x.app ?? "App"} — ${x.title ?? ""}: ${x.body ?? ""}`;
            });
            chunks.push(
              `I read ${v.length} item${v.length === 1 ? "" : "s"} in the shade:\n${lines.join("\n")}`,
            );
          }
          continue;
        }
        if (v && typeof v === "object") {
          const d = v as Record<string, unknown>;
          if ("battery" in d) {
            chunks.push(
              `${String(d.name ?? "Device")} is at ${String(d.battery)}. ${String(d.currentApp ?? "Home")} is in front. DND ${d.dnd ? "on" : "off"}, Wi-Fi ${d.wifi ? "on" : "off"}.`,
            );
            continue;
          }
        }
      } catch {
        /* fall through */
      }
    }
    chunks.push(c.length > 220 ? `${c.slice(0, 220)}…` : c);
  }
  return chunks.join("\n\n") || "Done.";
}

function localFallback(messages: AgentApiMessage[]): AgentTurnResult {
  const lastRole = messages[messages.length - 1]?.role;
  if (lastRole === "tool") {
    return { ok: true, content: localReplyFromTools(messages), toolCalls: [], local: true };
  }

  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const t = last.toLowerCase();

  const calls: AgentToolCall[] = [];
  const push = (name: string, args: ToolArgs) =>
    calls.push({ id: `local_${name}_${calls.length}`, name, args });

  if (/notification|shade|inbox|slack|mail|message/.test(t) && /read|what|summar|check|any|handle/.test(t)) {
    push("read_notifications", { unreadOnly: true });
  }
  if (/\bdnd\b|do not disturb|silence|quiet|mute everything/.test(t)) {
    push("set_device", { dnd: !/\boff\b/.test(t) && !/disable/.test(t) });
  }
  if (/flashlight|torch/.test(t)) {
    push("set_device", { flashlight: !/\boff\b/.test(t) && !/disable/.test(t) });
  }
  if (/night light/.test(t)) {
    push("set_device", { nightLight: !/\boff\b/.test(t) });
  }
  if (/wifi/.test(t) && /off|on|disable|enable/.test(t)) {
    push("set_device", { wifi: /on|enable/.test(t) });
  }
  if (/bluetooth/.test(t) && /off|on|disable|enable/.test(t)) {
    push("set_device", { bluetooth: /on|enable/.test(t) });
  }
  if (/airplane/.test(t)) {
    push("set_device", { airplane: !/\boff\b/.test(t) });
  }
  if (/brightness/.test(t)) {
    const n = t.match(/(\d{1,3})/);
    push("set_device", { brightness: n ? Math.min(100, Number(n[1])) : 40 });
  }
  if (/volume|ringer|silence the ringer/.test(t)) {
    if (/silence the ringer|ringer/.test(t) && !/volume/.test(t)) {
      const n = t.match(/(\d{1,3})/);
      push("set_device", { ringer: /silence/.test(t) ? 0 : n ? Math.min(100, Number(n[1])) : 0 });
    } else {
      const n = t.match(/(\d{1,3})/);
      push("set_device", { volume: n ? Math.min(100, Number(n[1])) : 20 });
    }
  }
  if (/pause|stop music|pause music/.test(t)) push("media_control", { action: "pause" });
  else if (/play music|resume/.test(t)) push("media_control", { action: "play" });
  if (/where am i|location|where is/.test(t)) push("get_location", {});
  if (/home screen|go home/.test(t)) push("press_key", { key: "home" });
  if (/what.?s on this phone|device state|phone status|battery/.test(t) && !calls.length) {
    push("get_device_state", {});
  }
  const open = t.match(/\b(?:open|launch)\s+(?:the\s+)?([a-z0-9 ]{2,20})/);
  if (open?.[1]) push("open_app", { name: open[1].trim() });
  if (/\bcall\b/.test(t) && !/callback/.test(t)) {
    const who = last.replace(/^.*call\s+/i, "").split(/[.!?]/)[0]?.trim() || "unknown";
    push("place_call", { nameOrNumber: who });
  }
  if (/\bsms\b|text |send a message/.test(t)) {
    push("send_sms", { to: "Maya Chen", body: last.slice(0, 140) });
  }
  if (/screenshot|capture the screen/.test(t)) push("capture_screenshot", {});
  if (/\bspeak\b|say out loud|read that/.test(t)) {
    push("speak", { text: last.replace(/^(please\s+)?(speak|say out loud|read that)\s*/i, "").slice(0, 180) || "Hermes is here." });
  }

  if (calls.length) {
    return { ok: true, content: "", toolCalls: calls, local: true };
  }

  return {
    ok: true,
    content:
      "I'm on the device in local-bridge mode. Ask me to read notifications, change DND, brightness, volume, flashlight, Wi-Fi, or launch an app.",
    toolCalls: [],
    local: true,
  };
}

export const runAgentTurn = createServerFn({ method: "POST" })
  .validator((input: AgentTurnInput) => input)
  .handler(async ({ data }): Promise<AgentTurnResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return localFallback(data.messages);

    const messages: AgentApiMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Live device snapshot:\n${data.snapshot.slice(0, 4000)}`,
      },
      ...data.messages.slice(-24),
    ];

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        messages,
        tools: HERMES_TOOLS,
        max_tokens: 700,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        return localFallback(data.messages);
      }
      return { ok: false, error: `Agent error ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ""}` };
    }

    const body = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    };

    const msg = body.choices?.[0]?.message;
    const toolCalls = (msg?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      args: parseArgs(c.function.arguments),
    }));

    return {
      ok: true,
      content: (msg?.content ?? "").trim(),
      toolCalls,
      local: false,
    };
  });
