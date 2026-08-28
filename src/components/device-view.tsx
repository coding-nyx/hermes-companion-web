import { useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { SectionLabel } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { INSTALLED_APPS } from "@/lib/hermes/catalog";
import { executeTool } from "@/lib/hermes/device-api";
import { useHermesStore } from "@/lib/hermes/store";

export function DeviceView() {
  const device = useHermesStore((s) => s.device);
  const locationLabel = useHermesStore((s) => s.locationLabel);
  const patchDevice = useHermesStore((s) => s.patchDevice);
  const [clip, setClip] = useState(device.clipboard);
  const [dial, setDial] = useState("");
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("");

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <p className="font-display text-2xl font-semibold tracking-[-0.04em]">Device</p>
        <p className="mt-1 text-sm text-muted">
          {device.name} · {device.currentApp}
          {device.lastKey ? ` · last key ${device.lastKey}` : ""}
        </p>
      </div>

      <section>
        <SectionLabel>Levels</SectionLabel>
        <div className="space-y-4 rounded-2xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
          <Level label="Brightness" value={device.brightness} onChange={(v) => patchDevice({ brightness: v })} />
          <Level label="Media volume" value={device.volume} onChange={(v) => patchDevice({ volume: v })} />
          <Level label="Ringer" value={device.ringer} onChange={(v) => patchDevice({ ringer: v })} />
        </div>
      </section>

      <section>
        <SectionLabel>Radios</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
          <ToggleRow
            label="Wi-Fi"
            checked={device.wifi}
            onChange={(v) => patchDevice({ wifi: v, airplane: v ? false : device.airplane })}
          />
          <ToggleRow label="Bluetooth" checked={device.bluetooth} onChange={(v) => patchDevice({ bluetooth: v })} />
          <ToggleRow
            label="Airplane"
            checked={device.airplane}
            onChange={(v) => patchDevice({ airplane: v, wifi: v ? false : true, bluetooth: v ? false : device.bluetooth })}
          />
          <ToggleRow label="Do not disturb" checked={device.dnd} onChange={(v) => patchDevice({ dnd: v })} />
          <ToggleRow label="Flashlight" checked={device.flashlight} onChange={(v) => patchDevice({ flashlight: v })} />
          <ToggleRow label="Night light" checked={device.nightLight} onChange={(v) => patchDevice({ nightLight: v })} />
          <ToggleRow label="Orientation lock" checked={device.orientationLock} onChange={(v) => patchDevice({ orientationLock: v })} />
          <ToggleRow label="Location sharing" checked={device.locationSharing} onChange={(v) => patchDevice({ locationSharing: v })} />
          <ToggleRow label="Charging" checked={device.charging} onChange={(v) => patchDevice({ charging: v })} />
        </div>
      </section>

      <section>
        <SectionLabel>Now playing</SectionLabel>
        <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-sm text-foreground">{device.media.title}</p>
          <p className="text-xs text-muted">{device.media.artist}</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => void executeTool("media_control", { action: "previous" })}>
              <SkipBack />
            </Button>
            <Button
              size="icon"
              className="rounded-full"
              aria-label={device.media.playing ? "Pause" : "Play"}
              onClick={() => void executeTool("media_control", { action: device.media.playing ? "pause" : "play" })}
            >
              {device.media.playing ? <Pause /> : <Play />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next" onClick={() => void executeTool("media_control", { action: "next" })}>
              <SkipForward />
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Apps</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {INSTALLED_APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => void executeTool("open_app", { name: app.name })}
              className={`flex min-h-16 flex-col items-start justify-center rounded-xl px-3 text-left ${
                device.currentApp === app.name
                  ? "bg-foreground text-background"
                  : "bg-surface text-foreground shadow-[var(--shadow-border)]"
              }`}
            >
              <span className="text-sm font-medium">{app.name}</span>
              <span className={`text-[10px] ${device.currentApp === app.name ? "text-background/70" : "text-subtle"}`}>
                {app.category}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Screen use</SectionLabel>
        <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-sm leading-relaxed text-muted">
            Reading the live UI tree, tapping, swiping, typing, and real app-usage stats need the native Android companion
            with Accessibility and usage access on. This web app can still control in-app device state.
          </p>
          <a
            href="https://github.com/coding-nyx/hermes-companion"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-8 items-center rounded-lg px-3 text-xs text-muted shadow-[var(--shadow-border)] hover:text-foreground"
          >
            Android node
          </a>
        </div>
      </section>

      <section>
        <SectionLabel>System keys</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {(["back", "home", "recents"] as const).map((key) => (
            <Button key={key} variant="outline" className="rounded-xl capitalize" onClick={() => void executeTool("press_key", { key })}>
              {key}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Clipboard</SectionLabel>
        <div className="flex gap-2">
          <Input value={clip} onChange={(e) => setClip(e.target.value)} placeholder="Clipboard text" />
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              void executeTool("clipboard_write", { text: clip });
            }}
          >
            Set
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Location</SectionLabel>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <p className="text-sm text-muted">{locationLabel}</p>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => void executeTool("get_location", {})}>
            Refresh
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Call / SMS</SectionLabel>
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <div className="flex gap-2">
            <Input value={dial} onChange={(e) => setDial(e.target.value)} placeholder="Name or number" />
            <Button
              className="rounded-xl"
              disabled={!dial.trim()}
              onClick={() => void executeTool("place_call", { nameOrNumber: dial.trim() }, { preapproved: true })}
            >
              Call
            </Button>
          </div>
          <Input value={smsTo} onChange={(e) => setSmsTo(e.target.value)} placeholder="SMS to" />
          <Input value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Message" />
          <Button
            variant="outline"
            className="w-full rounded-xl"
            disabled={!smsTo.trim() || !smsBody.trim()}
            onClick={() =>
              void executeTool("send_sms", { to: smsTo.trim(), body: smsBody.trim() }, { preapproved: true })
            }
          >
            Send SMS
          </Button>
        </div>
      </section>
    </div>
  );
}

function Level({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-xs text-muted tabular-nums">{Math.round(value)}</span>
      </div>
      <Slider min={0} max={100} step={1} value={[value]} onValueChange={(v) => onChange(v[0] ?? 0)} />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
