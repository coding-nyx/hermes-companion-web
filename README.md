# Hermes Companion (web)

Mobile-first web companion for the [Hermes agent](https://hermes-agent.nousresearch.com/). Pair a phone (or any browser) to a Hermes gateway, chat with tool-calling, control the device, and forward notifications and system updates back to Hermes.

## Repos

| Repo | What |
| --- | --- |
| [coding-nyx/hermes-companion-web](https://github.com/coding-nyx/hermes-companion-web) | This PWA |
| [coding-nyx/hermes-companion-plugin](https://github.com/coding-nyx/hermes-companion-plugin) | Hermes gateway platform plugin |
| [coding-nyx/hermes-companion](https://github.com/coding-nyx/hermes-companion) | Native Android companion |

## What it does

- **Pairing** — 6-character code, LAN / Tailscale discovery, or on-device loopback if no gateway is reachable
- **Chat** — sessions with tool chips, xAI when configured, local fallback so the demo still works offline
- **Device** — brightness, DND, night light, flashlight, volume, media, app grid, system keys; Battery Status API when the browser exposes it
- **Notify** — live shade, auto-forward queued alerts to Hermes, charging / battery-low system updates
- **Approvals** — Hermes-requested sensitive actions (call, SMS, screenshot) surface an in-app card

## Plugin (Hermes host)

The phone talks **out** over Tailscale. The plugin never needs a public inbound port.

On the machine that runs Hermes:

```bash
curl -fsSL https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main/install.sh | bash
hermes plugins enable companion
hermes gateway
```

Or copy `public/hermes-plugin/companion/` to `~/.hermes/plugins/platforms/companion/`.

| Env | Default | Purpose |
| --- | --- | --- |
| `COMPANION_PORT` | `8642` | Listen port |
| `COMPANION_BIND` | `0.0.0.0` | Bind (Tailscale needs this) |
| `COMPANION_PAIRING` | — | Lock pairing to this code |
| `COMPANION_HOME_CHANNEL` | `phone` | Chat id for unsolicited delivery |

After pair:

| Direction | Endpoint |
| --- | --- |
| Phone → Hermes | `POST /companion/inbox` |
| Hermes → phone | `GET /companion/outbox` (long-poll) |

## Develop

```bash
npm install
npm run dev
```

Typecheck: `npm run typecheck`.

Set `XAI_API_KEY` (or the app env the Vite plugin injects) if you want live model replies. Without it, the local tool fallback still answers.

## Stack

TanStack Start, React 19, Zustand (persisted pairing / sessions / shade / device), Tailwind 4, Zod.

## License

Same as you choose for the rest of the Hermes companion work. No license file is attached yet.
