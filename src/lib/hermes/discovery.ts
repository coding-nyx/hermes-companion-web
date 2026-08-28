import { COMPANION_PORT, type GatewayPeer, type HelloPayload } from "./protocol";
import { LOOPBACK_HELLO, ensureLoopback } from "./loopback";

const SHORT_NAMES = ["hermes", "hermes-gateway", "gateway", "companion", "studio"];

export function loopbackPeer(): GatewayPeer {
  ensureLoopback();
  return {
    id: "loopback",
    url: "loopback://companion",
    label: LOOPBACK_HELLO.label,
    detail: "Plugin runtime in this app · same protocol as Tailscale",
    kind: "loopback",
    latencyMs: 2,
    magicDns: LOOPBACK_HELLO.magicDns,
    reachable: true,
  };
}

export function peerFromUrl(url: string, label: string): GatewayPeer {
  return {
    id: url,
    url,
    label,
    detail: url,
    kind: "tailscale",
    latencyMs: null,
    reachable: true,
  };
}

function bases(tailnet: string, extraHost: string): string[] {
  const net = tailnet.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const extra = extraHost.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const hosts = new Set<string>();

  if (extra) {
    if (/^https?:/i.test(extraHost.trim())) hosts.add(extraHost.trim().replace(/\/$/, ""));
    else if (extra.includes(":")) hosts.add(`http://${extra}`);
    else hosts.add(`http://${extra}:${COMPANION_PORT}`);
  }

  for (const n of SHORT_NAMES) {
    hosts.add(`http://${n}:${COMPANION_PORT}`);
    if (net) {
      const suffix = net.includes(".") ? net : `${net}.ts.net`;
      hosts.add(`http://${n}.${suffix}:${COMPANION_PORT}`);
      hosts.add(`https://${n}.${suffix}`);
    }
  }
  if (net && !SHORT_NAMES.includes(net.split(".")[0] ?? "")) {
    hosts.add(`http://${net}:${COMPANION_PORT}`);
  }
  return [...hosts];
}

async function probe(url: string): Promise<GatewayPeer | null> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 1600);
  try {
    const res = await fetch(`${url}/companion/hello`, {
      method: "GET",
      mode: "cors",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const hello = (await res.json()) as HelloPayload;
    if (!hello?.ok) return null;
    return {
      id: url,
      url,
      label: hello.label || hello.name || url,
      detail: hello.magicDns || hello.tailscaleIps?.[0] || url,
      kind: "tailscale",
      latencyMs: Math.round(performance.now() - t0),
      magicDns: hello.magicDns,
      tailscaleIps: hello.tailscaleIps,
      reachable: true,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function discoverGateways(opts: {
  tailnet: string;
  extraHost: string;
}): Promise<GatewayPeer[]> {
  const loopback = loopbackPeer();
  const found = await Promise.all(bases(opts.tailnet, opts.extraHost).map(probe));
  const peers = found.filter((p): p is GatewayPeer => Boolean(p));
  const seen = new Set<string>();
  const unique: GatewayPeer[] = [loopback];
  for (const p of peers) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    unique.push(p);
  }
  return unique;
}
