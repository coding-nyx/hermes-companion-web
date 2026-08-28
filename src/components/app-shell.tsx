import { Bell, House, MessageSquare, MoreHorizontal, Smartphone } from "lucide-react";
import { Caduceus } from "@/components/mark";
import { HomeView } from "@/components/home-view";
import { ChatView } from "@/components/chat-view";
import { NotifyView } from "@/components/notify-view";
import { DeviceView } from "@/components/device-view";
import { MoreView } from "@/components/more-view";
import { ApprovalCard } from "@/components/approval-card";
import { Badge } from "@/components/ui/badge";
import { HermesRuntime } from "@/lib/hermes/runtime";
import { useHermesStore } from "@/lib/hermes/store";
import type { TabId } from "@/lib/hermes/types";
import { useEffect, useState } from "react";

const TABS: { id: TabId; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "chat", label: "Hermes", icon: MessageSquare },
  { id: "notify", label: "Shade", icon: Bell },
  { id: "device", label: "Device", icon: Smartphone },
  { id: "more", label: "More", icon: MoreHorizontal },
];

export function AppShell() {
  const tab = useHermesStore((s) => s.tab);
  const setTab = useHermesStore((s) => s.setTab);
  const device = useHermesStore((s) => s.device);
  const thinking = useHermesStore((s) => s.thinking);
  const latency = useHermesStore((s) => s.latencyMs);
  const unread = useHermesStore((s) => s.notifications.filter((n) => n.unread).length);
  const approval = useHermesStore((s) => s.pendingApproval);
  const linkUp = useHermesStore((s) => s.linkUp);
  const connectionKind = useHermesStore((s) => s.connectionKind);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-dvh bg-bg">
      <HermesRuntime />
      {device.nightLight ? <div className="night-wash pointer-events-none fixed inset-0 z-30" /> : null}
      {device.flashlight ? <div className="flash-wash pointer-events-none fixed inset-0 z-30" /> : null}

      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background sm:shadow-[var(--shadow-border)]">
        <header className="sticky top-0 z-20 bg-background/90 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
          <div className="flex items-center justify-between pb-1 font-mono text-[10px] text-subtle tabular-nums">
            <span>{clock}</span>
            <span>
              {device.wifi ? "Wi-Fi" : device.airplane ? "Airplane" : "Radio off"} · {Math.round(device.battery)}%
            </span>
          </div>
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-elevated text-foreground shadow-[var(--shadow-border)]">
                <Caduceus className="size-4" />
              </span>
              <div>
                <p className="font-display text-base font-semibold leading-none tracking-[-0.04em]">Hermes</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Companion</p>
              </div>
            </div>
            <Badge tone={thinking ? "warn" : linkUp ? "live" : "warn"} className="shrink-0">
              {thinking ? "working" : linkUp ? (connectionKind === "plugin" ? "plugin" : "runtime") : "reconnecting"} · {latency}ms
            </Badge>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-5">
          {tab === "home" ? <HomeView /> : null}
          {tab === "chat" ? <ChatView /> : null}
          {tab === "notify" ? <NotifyView /> : null}
          {tab === "device" ? <DeviceView /> : null}
          {tab === "more" ? <MoreView /> : null}
        </main>

        <div className="sticky bottom-0 z-20 bg-background/95 pt-2 backdrop-blur-sm">
          {approval ? (
            <div className="px-5 pb-2">
              <ApprovalCard />
            </div>
          ) : null}
          <nav className="grid grid-cols-5 border-t border-border px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
            {TABS.map((item) => {
              const active = tab === item.id;
              const Icon = item.icon;
              const badge = item.id === "notify" ? unread : item.id === "chat" && thinking ? 1 : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors duration-[var(--motion-quick)] ${
                    active ? "text-foreground" : "text-subtle hover:text-muted"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={active ? 2.2 : 1.8} />
                  {item.label}
                  {badge ? (
                    <span className="absolute right-[calc(50%-18px)] top-1 min-w-4 rounded-full bg-danger px-1 font-mono text-[9px] text-primary-foreground tabular-nums">
                      {item.id === "chat" ? "" : badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

function formatClock(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
