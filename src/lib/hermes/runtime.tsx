import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { randomIncoming } from "./catalog";
import { attentionPulse, showOsNotification } from "./device-api";
import { disconnectLink, getLiveLink, pingLive, reconnectFromStore } from "./gateway-client";
import { relayNotifications } from "./run-loop";
import { useHermesStore } from "./store";
import { uid } from "@/lib/utils";

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export function HermesRuntime() {
  const paired = useHermesStore((s) => s.paired);
  const listenerOn = useHermesStore((s) => s.listenerOn);
  const forwardToHermes = useHermesStore((s) => s.forwardToHermes);
  const thinking = useHermesStore((s) => s.thinking);
  const notifications = useHermesStore((s) => s.notifications);
  const battery = useHermesStore((s) => s.device.battery);
  const charging = useHermesStore((s) => s.device.charging);
  const warnedLow = useRef(false);
  const lastCharge = useRef<boolean | null>(null);

  useEffect(() => {
    if (!paired) {
      disconnectLink();
      return;
    }
    void reconnectFromStore();

    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    let stop = false;

    if (typeof nav.getBattery === "function") {
      void nav.getBattery().then((b) => {
        if (stop) return;
        const sync = () => {
          useHermesStore.getState().patchDevice({
            battery: Math.round(b.level * 100),
            charging: b.charging,
          });
        };
        sync();
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
      });
    }

    const id = window.setInterval(() => {
      const store = useHermesStore.getState();
      if (getLiveLink()) {
        void pingLive();
      } else {
        store.bumpPing();
        store.setLatency(12 + Math.round(Math.random() * 22));
        void reconnectFromStore();
      }
      if (typeof nav.getBattery === "function") return;
      const d = store.device;
      const next = d.charging ? Math.min(100, d.battery + 0.2) : Math.max(4, d.battery - 0.05);
      if (Math.round(next) !== Math.round(d.battery)) {
        store.patchDevice({ battery: next });
      }
    }, 9000);

    const onVis = () => {
      if (document.visibilityState === "visible") void reconnectFromStore();
    };
    const onOnline = () => void reconnectFromStore();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [paired]);

  useEffect(() => {
    if (!paired) return;
    const unread = notifications.filter((n) => n.unread).length;
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) void nav.setAppBadge?.(unread);
    else void nav.clearAppBadge?.();
  }, [notifications, paired]);

  useEffect(() => {
    if (!paired || !listenerOn) return;
    let timer = 0;
    const schedule = (first: boolean) => {
      const delay = first ? 22_000 + Math.random() * 10_000 : 55_000 + Math.random() * 35_000;
      timer = window.setTimeout(() => {
        if (document.hidden) {
          schedule(false);
          return;
        }
        const store = useHermesStore.getState();
        if (!store.listenerOn || store.thinking) {
          schedule(false);
          return;
        }
        const n = randomIncoming();
        store.addNotification(n, true);
        toast(n.app, { description: `${n.title} · ${n.body}` });
        if (!store.device.dnd) {
          attentionPulse();
          void showOsNotification(`${n.app} · ${n.title}`, n.body);
        }
        schedule(false);
      }, delay);
    };
    schedule(true);
    return () => window.clearTimeout(timer);
  }, [paired, listenerOn]);

  useEffect(() => {
    if (!paired || !forwardToHermes || thinking) return;
    const queued = notifications.filter((n) => n.queued && !n.forwarded);
    if (!queued.length) return;
    const t = window.setTimeout(() => {
      relayNotifications(queued.map((n) => n.id));
    }, 650);
    return () => window.clearTimeout(t);
  }, [notifications, forwardToHermes, thinking, paired]);

  useEffect(() => {
    if (!paired) return;
    const pairedAt = useHermesStore.getState().pairedAt;
    if (pairedAt && Date.now() - pairedAt < 5000) return;
    if (battery < 18 && !charging && !warnedLow.current) {
      warnedLow.current = true;
      const store = useHermesStore.getState();
      store.addNotification(
        {
          id: uid("ntf"),
          app: "System",
          title: "Battery low",
          body: `${Math.round(battery)}% remaining. Hermes can silence radios or find a charger.`,
          at: Date.now(),
          unread: true,
          forwarded: false,
          queued: false,
        },
        true,
      );
    }
    if (battery > 30 || charging) warnedLow.current = false;
  }, [battery, charging, paired]);

  useEffect(() => {
    if (!paired) return;
    const pairedAt = useHermesStore.getState().pairedAt;
    if (pairedAt && Date.now() - pairedAt < 5000) {
      lastCharge.current = charging;
      return;
    }
    if (lastCharge.current === null) {
      lastCharge.current = charging;
      return;
    }
    if (lastCharge.current === charging) return;
    lastCharge.current = charging;
    const store = useHermesStore.getState();
    store.addNotification(
      {
        id: uid("ntf"),
        app: "System",
        title: charging ? "Charging" : "Unplugged",
        body: charging
          ? `Power connected · ${Math.round(store.device.battery)}%`
          : `On battery · ${Math.round(store.device.battery)}%`,
        at: Date.now(),
        unread: true,
        forwarded: false,
        queued: false,
      },
      true,
    );
  }, [charging, paired]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = Notification.permission;
    useHermesStore.getState().setNotifyPermission(perm === "granted" ? "granted" : perm === "denied" ? "denied" : "unknown");
  }, []);

  return null;
}
