import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pairingCode, uid } from "@/lib/utils";
import { seedNotifications } from "./catalog";
import type {
  ActivityEntry,
  ChatMessage,
  ConnectionKind,
  DeviceState,
  PendingApproval,
  PhoneNotification,
  Session,
  TabId,
} from "./types";

const DEFAULT_DEVICE: DeviceState = {
  name: "Pixel 9 Pro",
  model: "Pixel 9 Pro",
  brightness: 62,
  volume: 44,
  ringer: 70,
  wifi: true,
  bluetooth: true,
  flashlight: false,
  dnd: false,
  airplane: false,
  orientationLock: false,
  nightLight: false,
  locationSharing: true,
  battery: 72,
  charging: false,
  currentApp: "Hermes Companion",
  clipboard: "hermes.local · pairing ready",
  media: {
    title: "Night Drive",
    artist: "Kiasmos",
    playing: false,
  },
  lastKey: null,
};

function newSession(partial?: Partial<Session>): Session {
  const now = Date.now();
  return {
    id: uid("ses"),
    title: "New session",
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...partial,
  };
}

type HermesState = {
  hydrated: boolean;
  paired: boolean;
  pairing: string;
  pairedAt: number | null;
  gateway: string;
  connectionKind: ConnectionKind;
  tailnet: string;
  pluginAck: boolean;
  peerUrl: string;
  linkUp: boolean;
  latencyMs: number;
  tab: TabId;
  device: DeviceState;
  notifications: PhoneNotification[];
  listenerOn: boolean;
  forwardToHermes: boolean;
  speakReplies: boolean;
  vibrateOnAttention: boolean;
  requireApproval: boolean;
  sessions: Session[];
  activeSessionId: string;
  thinking: boolean;
  activity: ActivityEntry[];
  pendingApproval: PendingApproval | null;
  lastPingAt: number;
  locationLabel: string;
  notifyPermission: "unknown" | "granted" | "denied";

  setHydrated: () => void;
  setTab: (tab: TabId) => void;
  pair: (info?: { gateway?: string; kind?: ConnectionKind; peerUrl?: string }) => void;
  unpair: () => void;
  rotateCode: () => void;
  setTailnet: (v: string) => void;
  setPluginAck: (v: boolean) => void;
  setLinkUp: (v: boolean) => void;
  patchDevice: (patch: Partial<DeviceState>) => void;
  setDeviceName: (name: string) => void;
  addNotification: (n: PhoneNotification, queueIfForwarding: boolean) => void;
  dismissNotification: (id: string) => void;
  markForwarded: (id: string) => void;
  markQueued: (ids: string[], queued: boolean) => void;
  setListener: (on: boolean) => void;
  setForward: (on: boolean) => void;
  setSpeakReplies: (on: boolean) => void;
  setVibrateOnAttention: (on: boolean) => void;
  setRequireApproval: (on: boolean) => void;
  setNotifyPermission: (v: HermesState["notifyPermission"]) => void;
  setLatency: (ms: number) => void;
  bumpPing: () => void;
  setLocationLabel: (label: string) => void;

  activeSession: () => Session;
  newChat: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  appendMessages: (sessionId: string, messages: ChatMessage[]) => void;
  patchLastAssistantTools: (sessionId: string, tools: ChatMessage["toolCalls"]) => void;
  setThinking: (v: boolean) => void;

  pushActivity: (entry: Omit<ActivityEntry, "id" | "at">) => void;
  setApproval: (a: PendingApproval | null) => void;
};

export const useHermesStore = create<HermesState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      paired: false,
      pairing: "------",
      pairedAt: null,
      gateway: "hermes.companion",
      connectionKind: "bridge",
      tailnet: "",
      pluginAck: false,
      peerUrl: "",
      linkUp: false,
      latencyMs: 18,
      tab: "home",
      device: DEFAULT_DEVICE,
      notifications: [],
      listenerOn: true,
      forwardToHermes: true,
      speakReplies: false,
      vibrateOnAttention: true,
      requireApproval: true,
      sessions: [newSession({ title: "Companion" })],
      activeSessionId: "",
      thinking: false,
      activity: [],
      pendingApproval: null,
      lastPingAt: Date.now(),
      locationLabel: "Mission District, San Francisco",
      notifyPermission: "unknown",

      setHydrated: () => {
        const s = get();
        if (s.hydrated) return;
        const sessions = (s.sessions.length ? s.sessions : [newSession({ title: "Companion" })]).map((ses) =>
          ses.title.startsWith("[phone notification") ? { ...ses, title: "Companion" } : ses,
        );
        const activeSessionId =
          sessions.find((x) => x.id === s.activeSessionId)?.id ?? sessions[0]!.id;
        set({ hydrated: true, sessions, activeSessionId, linkUp: false });
      },
      setTab: (tab) => set({ tab }),
      pair: (info) => {
        const first = newSession({ title: "Companion" });
        set({
          paired: true,
          pairedAt: Date.now(),
          gateway: info?.gateway ?? get().gateway,
          connectionKind: info?.kind ?? "bridge",
          peerUrl: info?.peerUrl ?? get().peerUrl,
          linkUp: true,
          notifications: seedNotifications(5),
          sessions: [first],
          activeSessionId: first.id,
          tab: "home",
          activity: [
            {
              id: uid("act"),
              at: Date.now(),
              kind: "system",
              title: "Gateway paired",
              detail: `Device linked over ${info?.gateway ?? get().gateway}`,
            },
          ],
        });
      },
      unpair: () =>
        set({
          paired: false,
          pairedAt: null,
          pairing: pairingCode(),
          tab: "home",
          thinking: false,
          pendingApproval: null,
          peerUrl: "",
          linkUp: false,
        }),
      rotateCode: () => set({ pairing: pairingCode() }),
      setTailnet: (v) => set({ tailnet: v }),
      setPluginAck: (v) => set({ pluginAck: v }),
      setLinkUp: (v) => set({ linkUp: v }),
      patchDevice: (patch) =>
        set({ device: { ...get().device, ...patch, media: { ...get().device.media, ...patch.media } } }),
      setDeviceName: (name) => set({ device: { ...get().device, name } }),
      addNotification: (n, queueIfForwarding) => {
        const queued = queueIfForwarding && get().forwardToHermes;
        const next = { ...n, queued };
        set({
          notifications: [next, ...get().notifications].slice(0, 24),
        });
        get().pushActivity({
          kind: "notify",
          title: `${n.app} · ${n.title}`,
          detail: queued ? "Queued for Hermes" : n.body,
        });
      },
      dismissNotification: (id) =>
        set({
          notifications: get().notifications.map((n) =>
            n.id === id ? { ...n, unread: false, queued: false } : n,
          ),
        }),
      markForwarded: (id) =>
        set({
          notifications: get().notifications.map((n) =>
            n.id === id ? { ...n, forwarded: true, queued: false, unread: false } : n,
          ),
        }),
      markQueued: (ids, queued) =>
        set({
          notifications: get().notifications.map((n) =>
            ids.includes(n.id) ? { ...n, queued } : n,
          ),
        }),
      setListener: (on) => set({ listenerOn: on }),
      setForward: (on) => set({ forwardToHermes: on }),
      setSpeakReplies: (on) => set({ speakReplies: on }),
      setVibrateOnAttention: (on) => set({ vibrateOnAttention: on }),
      setRequireApproval: (on) => set({ requireApproval: on }),
      setNotifyPermission: (v) => set({ notifyPermission: v }),
      setLatency: (ms) => set({ latencyMs: ms }),
      bumpPing: () => set({ lastPingAt: Date.now() }),
      setLocationLabel: (label) => set({ locationLabel: label }),

      activeSession: () => {
        const s = get();
        return s.sessions.find((x) => x.id === s.activeSessionId) ?? s.sessions[0]!;
      },
      newChat: () => {
        const ses = newSession({ title: "New session" });
        set({
          sessions: [ses, ...get().sessions].slice(0, 20),
          activeSessionId: ses.id,
          tab: "chat",
        });
      },
      selectSession: (id) => set({ activeSessionId: id, tab: "chat" }),
      deleteSession: (id) => {
        const sessions = get().sessions.filter((s) => s.id !== id);
        const next = sessions.length ? sessions : [newSession({ title: "Companion" })];
        set({
          sessions: next,
          activeSessionId: get().activeSessionId === id ? next[0]!.id : get().activeSessionId,
        });
      },
      renameSession: (id, title) =>
        set({
          sessions: get().sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        }),
      appendMessages: (sessionId, messages) =>
        set({
          sessions: get().sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const merged = [...s.messages, ...messages].slice(-80);
            const firstUser = merged.find(
              (m) => m.role === "user" && !m.content.startsWith("[phone notification"),
            );
            const title =
              s.title === "New session" || s.title === "Companion"
                ? (firstUser?.content ?? s.title).slice(0, 42)
                : s.title;
            return { ...s, messages: merged, updatedAt: Date.now(), title };
          }),
        }),
      patchLastAssistantTools: (sessionId, tools) =>
        set({
          sessions: get().sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const messages = [...s.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]!.role === "assistant" && messages[i]!.toolCalls) {
                messages[i] = { ...messages[i]!, toolCalls: tools };
                break;
              }
            }
            return { ...s, messages, updatedAt: Date.now() };
          }),
        }),
      setThinking: (v) => set({ thinking: v }),
      pushActivity: (entry) =>
        set({
          activity: [{ id: uid("act"), at: Date.now(), ...entry }, ...get().activity].slice(0, 40),
        }),
      setApproval: (a) => set({ pendingApproval: a }),
    }),
    {
      name: "hermes-companion-v1",
      partialize: (s) => ({
        paired: s.paired,
        pairing: s.pairing,
        pairedAt: s.pairedAt,
        gateway: s.gateway,
        connectionKind: s.connectionKind,
        tailnet: s.tailnet,
        pluginAck: s.pluginAck,
        peerUrl: s.peerUrl,
        tab: s.tab,
        device: s.device,
        notifications: s.notifications,
        listenerOn: s.listenerOn,
        forwardToHermes: s.forwardToHermes,
        speakReplies: s.speakReplies,
        vibrateOnAttention: s.vibrateOnAttention,
        requireApproval: s.requireApproval,
        sessions: s.sessions.map((ses) => ({
          ...ses,
          messages: ses.messages.slice(-40),
        })),
        activeSessionId: s.activeSessionId,
        activity: s.activity.slice(0, 20),
        locationLabel: s.locationLabel,
        notifyPermission: s.notifyPermission,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
