import { INSTALLED_APPS, APPROVAL_TOOLS } from "./catalog";
import { useHermesStore } from "./store";
import { uid } from "@/lib/utils";
import type { DeviceState, PhoneNotification } from "./types";

export type ToolExec = {
  ok: boolean;
  result: string;
  needsApproval?: boolean;
  approvalReason?: string;
};

function snapshotText(d: DeviceState, extra?: { location: string; notifCount: number }) {
  return JSON.stringify(
    {
      name: d.name,
      battery: `${Math.round(d.battery)}%${d.charging ? " charging" : ""}`,
      brightness: d.brightness,
      volume: d.volume,
      ringer: d.ringer,
      wifi: d.wifi,
      bluetooth: d.bluetooth,
      flashlight: d.flashlight,
      dnd: d.dnd,
      airplane: d.airplane,
      orientationLock: d.orientationLock,
      nightLight: d.nightLight,
      locationSharing: d.locationSharing,
      currentApp: d.currentApp,
      clipboard: d.clipboard.slice(0, 280),
      media: d.media,
      lastKey: d.lastKey,
      location: extra?.location,
      notificationsInShade: extra?.notifCount,
    },
    null,
    2,
  );
}

export function deviceSnapshot(): string {
  const s = useHermesStore.getState();
  return snapshotText(s.device, {
    location: s.locationLabel,
    notifCount: s.notifications.filter((n) => n.unread).length,
  });
}

export function notificationSnapshot(unreadOnly = false): PhoneNotification[] {
  const list = useHermesStore.getState().notifications;
  return unreadOnly ? list.filter((n) => n.unread) : list;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 280));
  u.rate = 1.02;
  u.pitch = 0.95;
  window.speechSynthesis.speak(u);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* virtual clipboard still updates */
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export async function showOsNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    /* embedded preview may block */
  }
}

export async function executeTool(
  name: string,
  args: Record<string, string | number | boolean>,
  opts: { preapproved?: boolean } = {},
): Promise<ToolExec> {
  const store = useHermesStore.getState();
  name = name.replace(/^companion_/, "");

  if (APPROVAL_TOOLS.has(name) && store.requireApproval && !opts.preapproved) {
    const reason =
      name === "place_call"
        ? `Place a call to ${String(args.nameOrNumber ?? "unknown")}`
        : name === "send_sms"
          ? `Send SMS to ${String(args.to ?? "unknown")}`
          : "Capture the current screen";
    return { ok: false, result: "needs_approval", needsApproval: true, approvalReason: reason };
  }

  switch (name) {
    case "get_device_state":
      return { ok: true, result: deviceSnapshot() };

    case "set_device": {
      const patch: Partial<DeviceState> = {};
      const keys = [
        "brightness",
        "volume",
        "ringer",
        "wifi",
        "bluetooth",
        "flashlight",
        "dnd",
        "airplane",
        "orientationLock",
        "nightLight",
        "locationSharing",
      ] as const;
      const changed: string[] = [];
      for (const k of keys) {
        if (k in args && args[k] !== undefined) {
          (patch as Record<string, unknown>)[k] = args[k];
          changed.push(`${k}=${String(args[k])}`);
        }
      }
      if (patch.airplane) {
        patch.wifi = false;
        patch.bluetooth = false;
      }
      store.patchDevice(patch);
      store.pushActivity({
        kind: "device",
        title: "Device updated",
        detail: changed.join(" · ") || "no-op",
      });
      return { ok: true, result: `Updated: ${changed.join(", ") || "nothing"}` };
    }

    case "read_notifications": {
      const unreadOnly = Boolean(args.unreadOnly);
      const list = notificationSnapshot(unreadOnly).slice(0, 12);
      return {
        ok: true,
        result: JSON.stringify(
          list.map((n) => ({
            id: n.id,
            app: n.app,
            title: n.title,
            body: n.body,
            unread: n.unread,
            forwarded: n.forwarded,
            queued: n.queued,
            ageMin: Math.round((Date.now() - n.at) / 60000),
          })),
          null,
          2,
        ),
      };
    }

    case "dismiss_notification": {
      const id = String(args.id ?? "");
      const found = store.notifications.find((n) => n.id === id);
      if (!found) return { ok: false, result: `No notification ${id}` };
      store.dismissNotification(id);
      store.pushActivity({
        kind: "notify",
        title: "Dismissed",
        detail: `${found.app} · ${found.title}`,
      });
      return { ok: true, result: `Dismissed ${found.app}: ${found.title}` };
    }

    case "post_notification": {
      const n: PhoneNotification = {
        id: uid("ntf"),
        app: String(args.app ?? "Hermes"),
        title: String(args.title ?? "Hermes"),
        body: String(args.body ?? ""),
        at: Date.now(),
        unread: true,
        forwarded: false,
        queued: false,
      };
      store.addNotification(n, false);
      void showOsNotification(n.title, n.body);
      return { ok: true, result: `Posted notification ${n.id}` };
    }

    case "open_app": {
      const q = String(args.name ?? "").toLowerCase();
      const app =
        INSTALLED_APPS.find((a) => a.name.toLowerCase() === q) ??
        INSTALLED_APPS.find((a) => a.name.toLowerCase().includes(q) || a.id === q);
      if (!app) return { ok: false, result: `App not found: ${args.name}` };
      store.patchDevice({ currentApp: app.name, lastKey: null });
      store.pushActivity({ kind: "device", title: "Opened app", detail: app.name });
      return { ok: true, result: `Opened ${app.name}` };
    }

    case "press_key": {
      const key = args.key as DeviceState["lastKey"];
      if (key !== "home" && key !== "back" && key !== "recents") {
        return { ok: false, result: "key must be home, back, or recents" };
      }
      const currentApp = key === "home" ? "Launcher" : store.device.currentApp;
      store.patchDevice({ lastKey: key, currentApp });
      store.pushActivity({ kind: "device", title: `Pressed ${key}`, detail: currentApp });
      return { ok: true, result: `Pressed ${key}` };
    }

    case "clipboard_write": {
      const text = String(args.text ?? "");
      store.patchDevice({ clipboard: text });
      await writeClipboard(text);
      store.pushActivity({ kind: "device", title: "Clipboard write", detail: text.slice(0, 80) });
      return { ok: true, result: `Clipboard set (${text.length} chars)` };
    }

    case "clipboard_read": {
      const live = await readClipboard();
      const text = live || store.device.clipboard;
      if (live) store.patchDevice({ clipboard: live });
      return { ok: true, result: text || "(empty)" };
    }

    case "speak": {
      const text = String(args.text ?? "");
      speak(text);
      store.pushActivity({ kind: "tool", title: "Spoke", detail: text.slice(0, 80) });
      return { ok: true, result: `Speaking: ${text.slice(0, 120)}` };
    }

    case "vibrate": {
      const pattern = String(args.pattern ?? "short");
      vibrate(pattern === "long" ? 240 : pattern === "double" ? [40, 60, 40] : 40);
      return { ok: true, result: `Vibrated ${pattern}` };
    }

    case "media_control": {
      const action = String(args.action ?? "");
      const media = { ...store.device.media };
      if (action === "play") media.playing = true;
      else if (action === "pause") media.playing = false;
      else if (action === "next") {
        media.title = "Looped";
        media.artist = "Rival Consoles";
        media.playing = true;
      } else if (action === "previous") {
        media.title = "Held";
        media.artist = "Kiasmos";
        media.playing = true;
      } else return { ok: false, result: "unknown action" };
      store.patchDevice({ media, currentApp: "Music" });
      store.pushActivity({ kind: "device", title: `Media ${action}`, detail: media.title });
      return { ok: true, result: `Media ${action}: ${media.title} — ${media.artist} (${media.playing ? "playing" : "paused"})` };
    }

    case "get_location": {
      if (!store.device.locationSharing) {
        return { ok: false, result: "Location sharing is off" };
      }
      const label = await readGeo(store.locationLabel);
      store.setLocationLabel(label);
      return { ok: true, result: label };
    }

    case "place_call": {
      const who = String(args.nameOrNumber ?? "");
      store.patchDevice({ currentApp: "Phone" });
      store.pushActivity({
        kind: "tool",
        title: "Call placed",
        detail: who,
      });
      vibrate(80);
      return { ok: true, result: `Dialing ${who}` };
    }

    case "send_sms": {
      const to = String(args.to ?? "");
      const body = String(args.body ?? "");
      store.patchDevice({ currentApp: "Messages" });
      store.pushActivity({ kind: "tool", title: `SMS to ${to}`, detail: body.slice(0, 120) });
      return { ok: true, result: `SMS sent to ${to}` };
    }

    case "capture_screenshot": {
      const d = store.device;
      const desc = `Screenshot of ${d.currentApp} on ${d.name}. Shade has ${store.notifications.filter((n) => n.unread).length} unread. DND=${d.dnd} flashlight=${d.flashlight} brightness=${d.brightness}.`;
      store.pushActivity({ kind: "tool", title: "Screenshot", detail: d.currentApp });
      return { ok: true, result: desc };
    }

    case "read_screen":
    case "tap":
    case "swipe":
    case "type":
    case "app_usage":
      return {
        ok: false,
        result:
          "Screen use (accessibility tree, tap/swipe/type, app usage) runs on the native Android companion after Accessibility and usage access are granted. This web companion cannot host those services.",
      };

    default:
      return { ok: false, result: `Unknown tool: ${name}` };
  }
}

function readGeo(fallback: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        resolve(`${latitude.toFixed(4)}, ${longitude.toFixed(4)} (device GPS)`);
      },
      () => resolve(fallback),
      { maximumAge: 60_000, timeout: 2500 },
    );
  });
}

export function speakAssistant(text: string) {
  if (!useHermesStore.getState().speakReplies) return;
  speak(text);
}

export function attentionPulse() {
  const s = useHermesStore.getState();
  if (s.vibrateOnAttention) vibrate([24, 40, 24]);
}
