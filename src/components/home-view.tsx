import {
  Bell,
  Bluetooth,
  Flashlight,
  Moon,
  Plane,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Caduceus } from "@/components/mark";
import { useHermesStore } from "@/lib/hermes/store";
import { relativeTime } from "@/lib/utils";
import { sendToHermes } from "@/lib/hermes/run-loop";

export function HomeView() {
  const device = useHermesStore((s) => s.device);
  const latency = useHermesStore((s) => s.latencyMs);
  const thinking = useHermesStore((s) => s.thinking);
  const linkUp = useHermesStore((s) => s.linkUp);
  const connectionKind = useHermesStore((s) => s.connectionKind);
  const gateway = useHermesStore((s) => s.gateway);
  const approval = useHermesStore((s) => s.pendingApproval);
  const notifications = useHermesStore((s) => s.notifications);
  const activity = useHermesStore((s) => s.activity);
  const patchDevice = useHermesStore((s) => s.patchDevice);
  const setTab = useHermesStore((s) => s.setTab);
  const session = useHermesStore((s) => s.activeSession());
  const queued = notifications.filter((n) => n.queued).length;
  const unread = notifications.filter((n) => n.unread).length;
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant" && m.content);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <section className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
            {device.name}
          </p>
          <Badge tone={thinking ? "warn" : linkUp ? "live" : "warn"}>
            {thinking ? "working" : linkUp ? (connectionKind === "plugin" ? "plugin" : "runtime") : "reconnecting"} · {latency}ms
          </Badge>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <div className="relative grid size-20 place-items-center">
            <svg viewBox="0 0 80 80" className="absolute inset-0 size-20 -rotate-90">
              <circle cx="40" cy="40" r="34" className="fill-none stroke-elevated" strokeWidth="4" />
              <circle
                cx="40"
                cy="40"
                r="34"
                className="fill-none stroke-foreground"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(device.battery / 100) * 213.6} 213.6`}
              />
            </svg>
            <Caduceus className="size-7 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold tracking-[-0.04em] tabular-nums">
              {Math.round(device.battery)}%
            </p>
            <p className="text-sm text-muted">
              {device.charging ? "Charging" : "On battery"} · {device.currentApp}
            </p>
            <p className="mt-1 text-xs text-subtle">
              {device.dnd ? "Do not disturb" : "Alerts on"} · {device.wifi ? "Wi-Fi" : "Radio off"} · {gateway}
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-foreground">
          {approval
            ? `Hermes needs approval: ${approval.reason}`
            : thinking
              ? "Hermes is running tools on this device."
              : lastAssistant
                ? lastAssistant.content.slice(0, 140)
                : "Hermes is idle. Relay a notification or ask it to take the wheel."}
        </p>
      </section>

      {approval ? (
        <button
          type="button"
          onClick={() => setTab("chat")}
          className="rounded-xl bg-warn/10 px-4 py-3 text-left text-sm text-warn shadow-[var(--shadow-border)]"
        >
          Action waiting · {approval.reason}
        </button>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
            Quick controls
          </h2>
          <button
            type="button"
            className="text-xs text-muted hover:text-foreground"
            onClick={() => setTab("device")}
          >
            All
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Quick
            label="Wi-Fi"
            active={device.wifi}
            onClick={() => patchDevice({ wifi: !device.wifi, airplane: false })}
            icon={device.wifi ? Wifi : WifiOff}
          />
          <Quick
            label="Bluetooth"
            active={device.bluetooth}
            onClick={() => patchDevice({ bluetooth: !device.bluetooth })}
            icon={Bluetooth}
          />
          <Quick
            label="DND"
            active={device.dnd}
            onClick={() => patchDevice({ dnd: !device.dnd })}
            icon={Moon}
          />
          <Quick
            label="Flash"
            active={device.flashlight}
            onClick={() => patchDevice({ flashlight: !device.flashlight })}
            icon={Flashlight}
          />
          <Quick
            label="Airplane"
            active={device.airplane}
            onClick={() =>
              patchDevice({
                airplane: !device.airplane,
                wifi: device.airplane,
                bluetooth: device.airplane,
              })
            }
            icon={Plane}
          />
          <Quick
            label="Silent"
            active={device.ringer === 0}
            onClick={() => patchDevice({ ringer: device.ringer === 0 ? 70 : 0 })}
            icon={Volume2}
          />
          <Quick
            label="Alerts"
            active={unread > 0}
            onClick={() => setTab("notify")}
            icon={Bell}
            badge={unread || undefined}
          />
          <Quick
            label="Queue"
            active={queued > 0}
            onClick={() => setTab("notify")}
            icon={Bell}
            badge={queued || undefined}
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
            Shade
          </h2>
          <button
            type="button"
            className="text-xs text-muted hover:text-foreground"
            onClick={() => setTab("notify")}
          >
            Open
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          {notifications.slice(0, 4).map((n, i) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setTab("notify")}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-elevated"
              style={i ? { boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--color-fg) 10%, transparent)" } : undefined}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {n.app}
                  <span className="text-muted"> · {n.title}</span>
                </p>
                <p className="truncate text-xs text-muted">{n.body}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-subtle tabular-nums">
                {relativeTime(n.at)}
              </span>
            </button>
          ))}
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Shade is empty.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
          Ask Hermes
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            "Summarize my notifications",
            "Turn on do not disturb",
            "Silence the ringer",
            "What’s on this phone?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendToHermes(q)}
              className="h-11 rounded-full bg-surface px-4 text-sm text-foreground shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
            >
              {q}
            </button>
          ))}
        </div>
      </section>

      {activity[0] ? (
        <p className="font-mono text-[11px] text-subtle">
          Last action · {activity[0].title} · {relativeTime(activity[0].at)}
        </p>
      ) : null}
    </div>
  );
}

function Quick({
  label,
  active,
  onClick,
  icon: Icon,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof Wifi;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-center transition-[background-color,box-shadow] duration-[var(--motion-quick)] ${
        active
          ? "bg-foreground text-background"
          : "bg-surface text-muted shadow-[var(--shadow-border)]"
      }`}
    >
      <Icon className="size-4" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {badge ? (
        <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-danger px-1 font-mono text-[9px] text-primary-foreground tabular-nums">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
