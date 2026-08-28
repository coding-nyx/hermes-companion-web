import type { InstalledApp, PhoneNotification } from "./types";
import { uid } from "@/lib/utils";

export const INSTALLED_APPS: InstalledApp[] = [
  { id: "phone", name: "Phone", category: "System" },
  { id: "messages", name: "Messages", category: "System" },
  { id: "mail", name: "Mail", category: "System" },
  { id: "calendar", name: "Calendar", category: "System" },
  { id: "maps", name: "Maps", category: "System" },
  { id: "camera", name: "Camera", category: "System" },
  { id: "photos", name: "Photos", category: "System" },
  { id: "clock", name: "Clock", category: "System" },
  { id: "settings", name: "Settings", category: "System" },
  { id: "chrome", name: "Chrome", category: "Internet" },
  { id: "music", name: "Music", category: "Media" },
  { id: "notes", name: "Notes", category: "Productivity" },
  { id: "slack", name: "Slack", category: "Work" },
  { id: "github", name: "GitHub", category: "Work" },
  { id: "banking", name: "Aether Bank", category: "Finance" },
];

export const SAMPLE_NOTIFICATIONS: Omit<PhoneNotification, "id" | "at">[] = [
  {
    app: "Messages",
    title: "Maya Chen",
    body: "Running 10 late — grab a table if you get there first?",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Calendar",
    title: "Design review in 25 min",
    body: "Studio North · Room 4. Bring the companion deck.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Slack",
    title: "hermes-ops",
    body: "Nightly evals finished. 2 tools failed rate-limit on android_screenshot.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Mail",
    title: "Boarding pass ready",
    body: "SFO → SEA · Saturday 7:10 AM · Gate assigned at 6:20.",
    unread: false,
    forwarded: false,
    queued: false,
  },
  {
    app: "GitHub",
    title: "nousresearch/hermes-agent",
    body: "CI passed on #1842 · mobile companion session resume.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Aether Bank",
    title: "Card used · $48.20",
    body: "Blue Bottle Coffee · Mission. If this wasn’t you, freeze the card.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Maps",
    title: "Leave in 12 minutes",
    body: "Usual route to Studio North is 18 min with light traffic.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Clock",
    title: "Alarm in 6 hours",
    body: "Weekday 6:30 AM is still on.",
    unread: false,
    forwarded: false,
    queued: false,
  },
  {
    app: "System",
    title: "Security update ready",
    body: "Play system update 15.2 · 48 MB. Restart when idle.",
    unread: true,
    forwarded: false,
    queued: false,
  },
  {
    app: "Play Store",
    title: "Messages 14.2",
    body: "Update ready · RCS fixes and quieter notifications.",
    unread: true,
    forwarded: false,
    queued: false,
  },
];

export function seedNotifications(count = 4): PhoneNotification[] {
  const now = Date.now();
  return SAMPLE_NOTIFICATIONS.slice(0, count).map((n, i) => ({
    ...n,
    id: uid("ntf"),
    at: now - (i + 1) * 1000 * 60 * (7 + i * 4),
  }));
}

export function randomIncoming(): PhoneNotification {
  const pool = SAMPLE_NOTIFICATIONS;
  const n = pool[Math.floor(Math.random() * pool.length)]!;
  return {
    ...n,
    id: uid("ntf"),
    at: Date.now(),
    unread: true,
    forwarded: false,
    queued: false,
  };
}

export const APPROVAL_TOOLS = new Set(["place_call", "send_sms", "capture_screenshot"]);

export const HERMES_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_device_state",
      description: "Read the current phone state: toggles, levels, battery, foreground app, media, clipboard.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_device",
      description: "Change device settings. Only include fields you want to change.",
      parameters: {
        type: "object",
        properties: {
          brightness: { type: "number", minimum: 0, maximum: 100 },
          volume: { type: "number", minimum: 0, maximum: 100 },
          ringer: { type: "number", minimum: 0, maximum: 100 },
          wifi: { type: "boolean" },
          bluetooth: { type: "boolean" },
          flashlight: { type: "boolean" },
          dnd: { type: "boolean" },
          airplane: { type: "boolean" },
          orientationLock: { type: "boolean" },
          nightLight: { type: "boolean" },
          locationSharing: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_notifications",
      description: "Read the notification shade. Use unreadOnly to skip dismissed/read items.",
      parameters: {
        type: "object",
        properties: { unreadOnly: { type: "boolean" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "dismiss_notification",
      description: "Dismiss a notification by id from the shade.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "post_notification",
      description: "Post a notification on the phone from Hermes (status, reminder, or alert).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          app: { type: "string" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_app",
      description: "Launch an installed app by name (Phone, Messages, Mail, Calendar, Maps, Camera, Photos, Clock, Settings, Chrome, Music, Notes, Slack, GitHub, Aether Bank).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "press_key",
      description: "Press a system key.",
      parameters: {
        type: "object",
        properties: { key: { type: "string", enum: ["home", "back", "recents"] } },
        required: ["key"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clipboard_write",
      description: "Write text onto the device clipboard.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clipboard_read",
      description: "Read the device clipboard.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "speak",
      description: "Speak text aloud on the device using text-to-speech.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "vibrate",
      description: "Vibrate the device.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string", enum: ["short", "double", "long"] } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "media_control",
      description: "Control the current media session.",
      parameters: {
        type: "object",
        properties: { action: { type: "string", enum: ["play", "pause", "next", "previous"] } },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_location",
      description: "Read the phone's last known location if location sharing is on.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_call",
      description: "Place a phone call. Requires user approval on the companion.",
      parameters: {
        type: "object",
        properties: {
          nameOrNumber: { type: "string" },
          reason: { type: "string" },
        },
        required: ["nameOrNumber"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_sms",
      description: "Send an SMS. Requires user approval on the companion.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "capture_screenshot",
      description: "Capture the current screen and return a textual description. Requires user approval.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export const SYSTEM_PROMPT = `You are Hermes, the user's personal agent, speaking through the Hermes Companion on their phone.
You already have a live paired connection to this device. Do not ask them to pair or install anything.

You can read the notification shade, change device settings, launch apps, speak, vibrate, control media, and (with approval) call, text, or screenshot.
Be concise and calm. Prefer doing over describing. Confirm only irreversible or sensitive actions.
When the user relays a notification, treat it as something they want handled — summarize, suggest, or act.
If you change the device, say what you changed in one short line after the tool result.
Never invent notification contents; use tools or the snapshot.`;
