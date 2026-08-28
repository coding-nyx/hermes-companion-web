import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { disconnectLink, reconnectFromStore } from "@/lib/hermes/gateway-client";
import { useHermesStore } from "@/lib/hermes/store";
import { relativeTime } from "@/lib/utils";

export function MoreView() {
  const device = useHermesStore((s) => s.device);
  const gateway = useHermesStore((s) => s.gateway);
  const pairing = useHermesStore((s) => s.pairing);
  const pairedAt = useHermesStore((s) => s.pairedAt);
  const connectionKind = useHermesStore((s) => s.connectionKind);
  const tailnet = useHermesStore((s) => s.tailnet);
  const peerUrl = useHermesStore((s) => s.peerUrl);
  const linkUp = useHermesStore((s) => s.linkUp);
  const latency = useHermesStore((s) => s.latencyMs);
  const lastPingAt = useHermesStore((s) => s.lastPingAt);
  const speakReplies = useHermesStore((s) => s.speakReplies);
  const vibrateOnAttention = useHermesStore((s) => s.vibrateOnAttention);
  const requireApproval = useHermesStore((s) => s.requireApproval);
  const sessions = useHermesStore((s) => s.sessions);
  const activeSessionId = useHermesStore((s) => s.activeSessionId);
  const activity = useHermesStore((s) => s.activity);
  const setDeviceName = useHermesStore((s) => s.setDeviceName);
  const setSpeakReplies = useHermesStore((s) => s.setSpeakReplies);
  const setVibrateOnAttention = useHermesStore((s) => s.setVibrateOnAttention);
  const setRequireApproval = useHermesStore((s) => s.setRequireApproval);
  const selectSession = useHermesStore((s) => s.selectSession);
  const deleteSession = useHermesStore((s) => s.deleteSession);
  const newChat = useHermesStore((s) => s.newChat);
  const unpair = useHermesStore((s) => s.unpair);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [name, setName] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const kindLabel = connectionKind === "plugin" ? "Hermes plugin" : "On-device runtime";
  const installCmd = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin ? `curl -fsSL ${origin}/hermes-plugin/install.sh | bash -s -- ${origin}` : "";
  }, []);

  async function reconnect() {
    setReconnecting(true);
    try {
      await reconnectFromStore();
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <p className="font-display text-2xl font-semibold tracking-[-0.04em]">More</p>
        <p className="mt-1 text-sm text-muted">Gateway, sessions, and how Hermes is allowed to act.</p>
      </div>

      <section>
        <SectionLabel>This device</SectionLabel>
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim()) setDeviceName(name.trim());
            }}
            aria-label="Device name"
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Gateway</dt>
            <dd className="text-right font-mono text-xs text-foreground">{gateway}</dd>
            <dt className="text-muted">Link</dt>
            <dd className="flex items-center justify-end gap-2">
              <Badge tone={linkUp ? "live" : "warn"}>{linkUp ? "up" : "reconnecting"}</Badge>
              <span className="font-mono text-xs text-foreground tabular-nums">{latency}ms</span>
            </dd>
            <dt className="text-muted">Channel</dt>
            <dd className="text-right text-xs text-foreground">{kindLabel}</dd>
            {tailnet ? (
              <>
                <dt className="text-muted">Tailnet</dt>
                <dd className="text-right font-mono text-xs text-foreground">{tailnet}</dd>
              </>
            ) : null}
            {peerUrl && !peerUrl.startsWith("loopback:") ? (
              <>
                <dt className="text-muted">Peer</dt>
                <dd className="truncate text-right font-mono text-xs text-foreground">{peerUrl}</dd>
              </>
            ) : null}
            <dt className="text-muted">Pairing</dt>
            <dd className="text-right font-mono text-xs tracking-[0.18em] text-foreground">{pairing}</dd>
            <dt className="text-muted">Linked</dt>
            <dd className="text-right text-xs text-foreground">{pairedAt ? relativeTime(pairedAt) : "—"}</dd>
            <dt className="text-muted">Last ping</dt>
            <dd className="text-right text-xs text-foreground">{relativeTime(lastPingAt)}</dd>
          </dl>
          <Button variant="outline" className="w-full rounded-xl" disabled={reconnecting} onClick={() => void reconnect()}>
            {reconnecting ? "Reconnecting…" : "Reconnect gateway"}
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Hermes plugin</SectionLabel>
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-sm leading-relaxed text-muted">
            Install on the Hermes machine, enable the companion platform, then scan this tailnet. The phone only dials out.
          </p>
          {installCmd ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground">
              {installCmd}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={async () => {
                if (!installCmd) return;
                try {
                  await navigator.clipboard.writeText(installCmd);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                } catch {
                  /* ignore */
                }
              }}
            >
              {copied ? "Copied" : "Copy install"}
            </Button>
            <a
              href="/hermes-plugin/README.md"
              className="inline-flex h-8 items-center rounded-lg px-3 text-xs text-muted shadow-[var(--shadow-border)] hover:text-foreground"
            >
              Plugin readme
            </a>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Agent</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm text-foreground">Require approval</span>
              <span className="block text-xs text-muted">Calls, SMS, and screenshots wait</span>
            </span>
            <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm text-foreground">Speak replies</span>
              <span className="block text-xs text-muted">Read Hermes out loud</span>
            </span>
            <Switch checked={speakReplies} onCheckedChange={setSpeakReplies} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm text-foreground">Vibrate on attention</span>
              <span className="block text-xs text-muted">Pulse when approval is needed</span>
            </span>
            <Switch checked={vibrateOnAttention} onCheckedChange={setVibrateOnAttention} />
          </label>
        </div>
      </section>

      <section>
        <SectionLabel
          action={
            <button type="button" className="text-xs text-muted hover:text-foreground" onClick={newChat}>
              New
            </button>
          }
        >
          Sessions
        </SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => selectSession(s.id)}
              >
                <p className={`truncate text-sm ${s.id === activeSessionId ? "text-foreground" : "text-muted"}`}>
                  {s.title.startsWith("[phone notification") ? "Companion" : s.title}
                </p>
                <p className="font-mono text-[10px] text-subtle tabular-nums">{relativeTime(s.updatedAt)}</p>
              </button>
              <button
                type="button"
                className="text-xs text-subtle hover:text-danger"
                onClick={() => deleteSession(s.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Activity</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          {activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No actions yet.</p>
          ) : (
            activity.slice(0, 12).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm text-foreground">{a.title}</p>
                <p className="truncate text-xs text-muted">{a.detail}</p>
                <p className="mt-0.5 font-mono text-[10px] text-subtle tabular-nums">
                  {a.kind} · {relativeTime(a.at)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        {confirmUnpair ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1 rounded-xl"
              onClick={() => {
                disconnectLink();
                unpair();
              }}
            >
              Unpair now
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmUnpair(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full rounded-xl" onClick={() => setConfirmUnpair(true)}>
            Unpair this device
          </Button>
        )}
      </section>
    </div>
  );
}
