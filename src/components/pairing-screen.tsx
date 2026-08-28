import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Caduceus } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { discoverGateways } from "@/lib/hermes/discovery";
import { connectPeer } from "@/lib/hermes/gateway-client";
import type { GatewayPeer } from "@/lib/hermes/protocol";
import { useHermesStore } from "@/lib/hermes/store";

const PLUGIN_INSTALL =
  "curl -fsSL https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main/install.sh | bash";

type Step = "install" | "discover" | "pair";

export function PairingScreen() {
  const pairing = useHermesStore((s) => s.pairing);
  const pair = useHermesStore((s) => s.pair);
  const rotateCode = useHermesStore((s) => s.rotateCode);
  const tailnet = useHermesStore((s) => s.tailnet);
  const setTailnet = useHermesStore((s) => s.setTailnet);
  const pluginAck = useHermesStore((s) => s.pluginAck);
  const setPluginAck = useHermesStore((s) => s.setPluginAck);
  const [phase, setPhase] = useState<"idle" | "linking">("idle");
  const [codeReady, setCodeReady] = useState(false);
  const [step, setStep] = useState<Step>(pluginAck ? "discover" : "install");
  const [copied, setCopied] = useState(false);
  const [extraHost, setExtraHost] = useState("");
  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<GatewayPeer[]>([]);
  const [selected, setSelected] = useState<string>("loopback");
  const [error, setError] = useState("");

  useEffect(() => {
    if (pairing === "------") rotateCode();
    setCodeReady(true);
  }, [pairing, rotateCode]);

  const installCmd = PLUGIN_INSTALL;

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const list = await discoverGateways({ tailnet, extraHost });
      setPeers(list);
      if (!list.find((p) => p.id === selected)) setSelected(list[0]?.id ?? "loopback");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (step === "discover" || (step === "pair" && !peers.length)) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function connect() {
    let list = peers;
    if (!list.length) {
      list = await discoverGateways({ tailnet, extraHost });
      setPeers(list);
    }
    const peer = list.find((p) => p.id === selected) ?? list[0];
    if (!peer) return;
    setPhase("linking");
    setError("");
    try {
      await connectPeer(peer, pairing);
      pair({
        gateway: peer.magicDns || peer.label,
        kind: peer.kind === "loopback" ? "bridge" : "plugin",
        peerUrl: peer.url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair");
      setPhase("idle");
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10 sm:px-8">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-elevated text-foreground shadow-[var(--shadow-border)]">
          <Caduceus className="size-6" />
        </span>
        <div>
          <p className="font-display text-base font-semibold tracking-[-0.04em]">Hermes</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Companion</p>
        </div>
      </header>

      <nav className="mt-8 flex gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
        {(["install", "discover", "pair"] as Step[]).map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={step === s ? "text-foreground" : "hover:text-muted"}
          >
            {i + 1} {s}
          </button>
        ))}
      </nav>

      <section className="stagger-in flex flex-1 flex-col py-8">
        {step === "install" ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Plugin</p>
            <h1 className="mt-3 max-w-[16ch] font-display text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.04em]">
              Install Companion on the Hermes box.
            </h1>
            <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted">
              This is a gateway platform plugin. Hermes advertises itself on Tailscale; the phone only dials out.
            </p>
            <div className="mt-6 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">On the Hermes machine</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground">
                {installCmd}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(installCmd);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <a
                  href="https://github.com/coding-nyx/hermes-companion-plugin"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-lg px-3 text-xs text-muted shadow-[var(--shadow-border)] hover:text-foreground"
                >
                  Plugin readme
                </a>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Then <span className="text-foreground">hermes plugins enable companion</span> and{" "}
                <span className="text-foreground">hermes gateway</span>. Listens on port 8642 for MagicDNS.
              </p>
            </div>
            <Button
              size="lg"
              className="mt-6 w-full rounded-xl"
              onClick={() => {
                setPluginAck(true);
                setStep("discover");
              }}
            >
              Plugin is installed
            </Button>
          </>
        ) : null}

        {step === "discover" ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Tailscale</p>
            <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.04em]">
              Find the gateway on your tailnet.
            </h1>
            <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted">
              {"Scans MagicDNS names like hermes.<tailnet>.ts.net. The on-device runtime is always available."}
            </p>
            <div className="mt-6 space-y-3">
              <Input
                value={tailnet}
                onChange={(e) => setTailnet(e.target.value)}
                placeholder="tailnet.ts.net"
                aria-label="Tailnet"
              />
              <Input
                value={extraHost}
                onChange={(e) => setExtraHost(e.target.value)}
                placeholder="hermes or 100.x.y.z:8642"
                aria-label="Extra host"
              />
              <Button variant="outline" className="w-full rounded-xl" disabled={scanning} onClick={() => void scan()}>
                {scanning ? "Scanning tailnet…" : "Scan again"}
              </Button>
            </div>
            <ul className="mt-5 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
              {peers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-elevated"
                  >
                    <span>
                      <span className="block text-sm text-foreground">{p.label}</span>
                      <span className="block text-xs text-muted">{p.detail}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      {selected === p.id ? <Badge tone="solid">selected</Badge> : null}
                      <span className="font-mono text-[10px] text-subtle tabular-nums">
                        {p.kind === "loopback" ? "runtime" : `${p.latencyMs ?? "—"}ms`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {!peers.length && !scanning ? (
                <li className="px-4 py-8 text-center text-sm text-muted">No peers yet. Scan your tailnet.</li>
              ) : null}
            </ul>
            <Button size="lg" className="mt-6 w-full rounded-xl" disabled={!selected} onClick={() => setStep("pair")}>
              Use this gateway
            </Button>
          </>
        ) : null}

        {step === "pair" ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Pair</p>
            <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.04em]">
              Show Hermes this code.
            </h1>
            <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted">
              The plugin accepts the phone’s code. Optional COMPANION_PAIRING on the box locks it.
            </p>
            <div className="mt-6 rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Pairing code</p>
                  <p className="mt-2 font-mono text-3xl tracking-[0.28em] text-foreground tabular-nums">
                    {codeReady ? pairing : "------"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={rotateCode}
                  className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-foreground"
                  aria-label="Rotate pairing code"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
              <p className="mt-4 text-xs text-muted">
                {peers.find((p) => p.id === selected)?.label ?? "Gateway"} · outbound only
              </p>
            </div>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <Button
              size="lg"
              className="mt-6 w-full rounded-xl"
              disabled={phase === "linking"}
              onClick={() => void connect()}
            >
              {phase === "linking" ? "Linking gateway…" : "Connect this device"}
            </Button>
          </>
        ) : null}
      </section>
    </main>
  );
}
