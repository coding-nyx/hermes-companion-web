# Hermes Companion plugin

Canonical source: [coding-nyx/hermes-companion-plugin](https://github.com/coding-nyx/hermes-companion-plugin).

Platform adapter for [Hermes Agent](https://hermes-agent.nousresearch.com/). The phone connects **out** over Tailscale; this process never needs inbound ports on the public internet.

## Install

On the machine that runs Hermes:

```bash
curl -fsSL https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main/install.sh | bash
hermes plugins enable companion
hermes gateway
```

Or copy `companion/` to `~/.hermes/plugins/platforms/companion/`.

Optional env:

- `COMPANION_PORT` — listen port (default `8642`)
- `COMPANION_BIND` — bind address (default `0.0.0.0`, required for Tailscale)
- `COMPANION_PAIRING` — lock pairing to this code
- `COMPANION_HOME_CHANNEL` — chat id for unsolicited delivery (default `phone`)

## Discovery

The plugin serves `GET /companion/hello` (CORS open) and includes MagicDNS + Tailscale IPs from `tailscale status --json`. Companion scans:

- `hermes`, `hermes-gateway`, `gateway`, `companion`, `studio` on port 8642
- `<name>.<tailnet>.ts.net`
- any host you type in

If Tailscale is not reachable from the phone, Companion falls back to the on-device plugin runtime that speaks the same mailbox protocol.

## Pairing

The phone shows a 6-character code and `POST`s it to `/companion/pair`. Optional `COMPANION_PAIRING` locks the code. After pair:

| Direction | Endpoint | Payload |
| --- | --- | --- |
| Phone → Hermes | `POST /companion/inbox` | chat, forwarded notifications, tool results, pings |
| Hermes → phone | `GET /companion/outbox` (8s long-poll) | replies, `companion_*` device tools |

The phone is outbound-only. No public inbound ports.

## Tools

Hermes can `companion_set_device`, read the shade, open apps, speak, vibrate, and — with on-device approval — place calls, send SMS, or capture a screenshot.
