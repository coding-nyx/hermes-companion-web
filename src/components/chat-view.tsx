import { useEffect, useRef, useState } from "react";
import { Mic, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendToHermes } from "@/lib/hermes/run-loop";
import { useHermesStore } from "@/lib/hermes/store";
import type { ToolCall } from "@/lib/hermes/types";

const SUGGESTIONS = [
  "Summarize my notifications",
  "What’s on this phone?",
  "Turn on do not disturb",
  "Dim brightness to 20",
];

const TOOL_LABELS: Record<string, string> = {
  get_device_state: "Read device",
  set_device: "Set device",
  read_notifications: "Read shade",
  dismiss_notification: "Dismiss",
  post_notification: "Post alert",
  open_app: "Open app",
  press_key: "Press key",
  clipboard_write: "Clipboard write",
  clipboard_read: "Clipboard read",
  speak: "Speak",
  vibrate: "Vibrate",
  media_control: "Media",
  get_location: "Location",
  place_call: "Place call",
  send_sms: "Send SMS",
  capture_screenshot: "Screenshot",
  read_screen: "Read screen",
  tap: "Tap",
  swipe: "Swipe",
  type: "Type",
  app_usage: "App usage",
};

export function ChatView() {
  const session = useHermesStore((s) => s.activeSession());
  const thinking = useHermesStore((s) => s.thinking);
  const newChat = useHermesStore((s) => s.newChat);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const visible = session.messages.filter((m) => m.role === "user" || m.role === "assistant");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.messages.length, thinking]);

  function submit(text = draft) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setDraft("");
    void sendToHermes(trimmed);
  }

  function toggleVoice() {
    const SR = (window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said) submit(said);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="truncate pr-3 font-display text-xl font-semibold tracking-[-0.04em]">
          {session.title.startsWith("[phone notification") ? "Companion" : session.title}
        </p>
        <Button variant="ghost" size="icon-sm" onClick={newChat} aria-label="New session">
          <Plus />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {visible.length === 0 ? (
          <div className="stagger-in py-6">
            <p className="font-display text-2xl font-semibold tracking-[-0.04em]">Hermes is on the device.</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Ask it to read the shade, change radios, or take the wheel. Sensitive actions wait for you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  className="h-11 rounded-full bg-surface px-4 text-sm text-foreground shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {visible.map((m) => (
          <article key={m.id} className={m.role === "user" ? "ml-8" : "mr-4"}>
            {m.role === "user" ? (
              <p className="rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm leading-relaxed text-background">
                {m.content}
              </p>
            ) : (
              <div>
                {m.content ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.content}</p>
                ) : null}
                {m.toolCalls?.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {m.toolCalls.map((t) => (
                      <li key={t.id}>
                        <ToolChip tool={t} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </article>
        ))}

        {thinking ? (
          <p className="shimmer font-mono text-[11px] uppercase tracking-[0.16em]">Hermes is working</p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 rounded-2xl bg-surface p-2 shadow-[var(--shadow-border)]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          onClick={toggleVoice}
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${
            listening ? "bg-foreground text-background" : "text-muted hover:text-foreground"
          }`}
          aria-label="Voice input"
        >
          <Mic className="size-4" />
        </button>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Hermes…"
          rows={1}
          className="min-h-11 max-h-32 flex-1 border-0 bg-transparent px-1 py-2.5 shadow-none"
        />
        <Button type="submit" size="icon" className="rounded-xl" disabled={thinking || !draft.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}

function ToolChip({ tool }: { tool: ToolCall }) {
  const tone =
    tool.status === "denied"
      ? "text-danger"
      : tool.status === "needs_approval"
        ? "text-warn"
        : tool.status === "done"
          ? "text-ok"
          : "text-muted";
  return (
    <div className="rounded-lg bg-elevated px-3 py-2">
      <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}>
        {TOOL_LABELS[tool.name.replace(/^companion_/, "")] ?? tool.name.replace(/^companion_/, "")} · {tool.status.replace("_", " ")}
      </p>
      {tool.result ? <p className="mt-1 line-clamp-3 text-xs text-muted">{tool.result}</p> : null}
    </div>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0?: { 0?: { transcript?: string } } } }) => void) | null;
  onend: (() => void) | null;
};
