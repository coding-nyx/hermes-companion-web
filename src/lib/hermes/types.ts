export type TabId = "home" | "chat" | "notify" | "device" | "more";

export type ConnectionKind = "plugin" | "bridge";

export type DeviceState = {
  name: string;
  model: string;
  brightness: number;
  volume: number;
  ringer: number;
  wifi: boolean;
  bluetooth: boolean;
  flashlight: boolean;
  dnd: boolean;
  airplane: boolean;
  orientationLock: boolean;
  nightLight: boolean;
  locationSharing: boolean;
  battery: number;
  charging: boolean;
  currentApp: string;
  clipboard: string;
  media: {
    title: string;
    artist: string;
    playing: boolean;
  };
  lastKey: "home" | "back" | "recents" | null;
};

export type InstalledApp = {
  id: string;
  name: string;
  category: string;
};

export type PhoneNotification = {
  id: string;
  app: string;
  title: string;
  body: string;
  at: number;
  unread: boolean;
  forwarded: boolean;
  queued: boolean;
};

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ToolArgs = Record<string, string | number | boolean>;

export type ToolCall = {
  id: string;
  name: string;
  args: ToolArgs;
  result?: string;
  status: "pending" | "running" | "done" | "denied" | "needs_approval";
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  toolCalls?: ToolCall[];
  toolName?: string;
  toolCallId?: string;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type ActivityEntry = {
  id: string;
  at: number;
  kind: "tool" | "notify" | "system" | "device";
  title: string;
  detail: string;
};

export type PendingApproval = {
  id: string;
  toolCallId: string;
  name: string;
  args: ToolArgs;
  reason: string;
};

export type AgentApiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};
