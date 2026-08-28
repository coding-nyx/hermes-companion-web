import type { ToolArgs } from "./types";

export const COMPANION_PORT = 8642;

export type GatewayPeer = {
  id: string;
  url: string;
  label: string;
  detail: string;
  kind: "tailscale" | "loopback" | "manual";
  latencyMs: number | null;
  magicDns?: string;
  tailscaleIps?: string[];
  reachable: boolean;
};

export type WireMsg =
  | { type: "pair"; code: string; device: { name: string; model: string } }
  | { type: "paired"; ok: boolean; session: string; host: string; error?: string }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number }
  | { type: "user"; id: string; text: string }
  | { type: "assistant"; id: string; text: string }
  | { type: "notify"; id: string; app: string; title: string; body: string }
  | { type: "tool_call"; id: string; name: string; args: ToolArgs }
  | { type: "tool_result"; id: string; ok: boolean; result: string }
  | { type: "approval"; id: string; name: string; args: ToolArgs; reason: string }
  | { type: "approval_response"; id: string; approved: boolean }
  | { type: "device_state"; snapshot: string };

export type HelloPayload = {
  ok: boolean;
  name: string;
  label: string;
  version: string;
  port: number;
  magicDns?: string;
  tailscaleIps?: string[];
  pairing: boolean;
};

export function isWireMsg(v: unknown): v is WireMsg {
  return Boolean(v && typeof v === "object" && "type" in (v as object));
}
