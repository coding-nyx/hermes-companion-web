import { useState } from "react";
import { toast } from "sonner";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { randomIncoming } from "@/lib/hermes/catalog";
import { attentionPulse, showOsNotification } from "@/lib/hermes/device-api";
import { relayNotifications, sendToHermes } from "@/lib/hermes/run-loop";
import { useHermesStore } from "@/lib/hermes/store";
import { relativeTime } from "@/lib/utils";

type Filter = "all" | "unread" | "queued";

export function NotifyView() {
  const notifications = useHermesStore((s) => s.notifications);
  const listenerOn = useHermesStore((s) => s.listenerOn);
  const forwardToHermes = useHermesStore((s) => s.forwardToHermes);
  const permission = useHermesStore((s) => s.notifyPermission);
  const thinking = useHermesStore((s) => s.thinking);
  const setListener = useHermesStore((s) => s.setListener);
  const setForward = useHermesStore((s) => s.setForward);
  const dismissNotification = useHermesStore((s) => s.dismissNotification);
  const addNotification = useHermesStore((s) => s.addNotification);
  const setNotifyPermission = useHermesStore((s) => s.setNotifyPermission);
  const [filter, setFilter] = useState<Filter>("all");

  const queued = notifications.filter((n) => n.queued);
  const unread = notifications.filter((n) => n.unread);
  const list =
    filter === "unread" ? unread : filter === "queued" ? queued : notifications;

  async function toggleListener(on: boolean) {
    setListener(on);
    if (on && "Notification" in window && Notification.permission === "default") {
      const p = await Notification.requestPermission();
      setNotifyPermission(p === "granted" ? "granted" : p === "denied" ? "denied" : "unknown");
    }
  }

  function inject() {
    const n = randomIncoming();
    addNotification(n, true);
    toast(n.app, { description: n.title });
    const dnd = useHermesStore.getState().device.dnd;
    if (!dnd) {
      attentionPulse();
      void showOsNotification(`${n.app} · ${n.title}`, n.body);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <p className="font-display text-2xl font-semibold tracking-[-0.04em]">Notification shade</p>
        <p className="mt-1 text-sm text-muted">
          Listener captures alerts. Hermes is told when you forward — or automatically, if the queue is on.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <Row
          title="Notification listener"
          detail={listenerOn ? "Capturing shade events" : "Paused"}
          checked={listenerOn}
          onCheckedChange={toggleListener}
        />
        <Row
          title="Forward to Hermes"
          detail="Queue new alerts for the agent"
          checked={forwardToHermes}
          onCheckedChange={setForward}
        />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm text-foreground">OS notifications</p>
            <p className="text-xs text-muted">
              {permission === "granted" ? "Browser alerts allowed" : permission === "denied" ? "Blocked in the browser" : "Not requested yet"}
            </p>
          </div>
          {permission !== "granted" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={async () => {
                if (!("Notification" in window)) return;
                const p = await Notification.requestPermission();
                setNotifyPermission(p === "granted" ? "granted" : p === "denied" ? "denied" : "unknown");
              }}
            >
              Allow
            </Button>
          ) : (
            <Badge tone="live">granted</Badge>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="rounded-lg" onClick={inject}>
          Inject alert
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={!queued.length || thinking}
          onClick={() => relayNotifications(queued.map((n) => n.id))}
        >
          Forward queue{queued.length ? ` (${queued.length})` : ""}
        </Button>
      </div>

      <section>
        <SectionLabel
          action={
            <div className="flex gap-1">
              {(["all", "unread", "queued"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`h-8 rounded-full px-3 text-xs capitalize ${
                    filter === f ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        >
          Shade
        </SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Nothing in this filter.</p>
          ) : (
            list.map((n, i) => (
              <article
                key={n.id}
                className="px-4 py-3"
                style={i ? { boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--color-fg, var(--color-foreground)) 10%, transparent)" } : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {n.app}
                      <span className="text-muted"> · {n.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{n.body}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {!n.forwarded ? (
                        <button
                          type="button"
                          className="text-xs text-foreground hover:underline"
                          disabled={thinking}
                          onClick={() => relayNotifications([n.id])}
                        >
                          Forward
                        </button>
                      ) : (
                        <span className="text-xs text-ok">Sent</span>
                      )}
                      {n.unread ? (
                        <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => dismissNotification(n.id)}>
                          Dismiss
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs text-muted hover:text-foreground"
                        disabled={thinking}
                        onClick={() => void sendToHermes(`Handle this notification:\n${n.app} — ${n.title}: ${n.body}`)}
                      >
                        Ask Hermes
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-[10px] text-subtle tabular-nums">{relativeTime(n.at)}</span>
                    {n.queued ? <Badge tone="warn">queued</Badge> : n.unread ? <Badge>unread</Badge> : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  title,
  detail,
  checked,
  onCheckedChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
      <span>
        <span className="block text-sm text-foreground">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
