# Hermes Companion plugin

Canonical source: [coding-nyx/hermes-companion-plugin](https://github.com/coding-nyx/hermes-companion-plugin).

Platform adapter for [Hermes Agent](https://hermes-agent.nousresearch.com/). The phone connects **out** over Tailscale; this process never needs inbound ports on the public internet.

Pairs with:

- [hermes-companion-web](https://github.com/coding-nyx/hermes-companion-web) — web PWA (mailbox `/companion/*`)
- [hermes-companion](https://github.com/coding-nyx/hermes-companion) `feat/completion` — native Android node (`POST /pair`, `WS /ws/node`)

## Install

On the machine that runs Hermes:

```bash
curl -fsSL https://raw.githubusercontent.com/coding-nyx/hermes-companion-plugin/main/install.sh | bash
hermes plugins enable companion
hermes gateway
```

Or copy `companion/` to `~/.hermes/plugins/platforms/companion/`.

Optional env:

| Env | Default | Purpose |
| --- | --- | --- |
| `COMPANION_PORT` | `8642` | Listen port |
| `COMPANION_BIND` | `0.0.0.0` | Bind (Tailscale needs this) |
| `COMPANION_PAIRING` | — | Lock pairing to this code |
| `COMPANION_HOME_CHANNEL` | `phone` | Chat id for unsolicited delivery |
| `COMPANION_BROKER_HOST` | request `Host` | Host advertised as `brokerUrl` |

## Discovery

`GET /companion/hello` (CORS open) includes MagicDNS + Tailscale IPs from `tailscale status --json`.

Scan `hermes`, `hermes-gateway`, `gateway`, `companion`, `studio` on port **8642**, or `<name>.<tailnet>.ts.net`.

## Two pairing planes

Do not mix these with the Hermes chat gateway (`/api/profiles`, `/v1/runs`). Chat stays on the Hermes HTTP/SSE API. This plugin is the **device node**.

### Web PWA — mailbox

The phone shows a 6-character code and `POST`s it to `/companion/pair`.

| Direction | Endpoint | Payload |
| --- | --- | --- |
| Phone → Hermes | `POST /companion/inbox` | chat, forwarded notifications, tool results, pings |
| Hermes → phone | `GET /companion/outbox` (8s long-poll) | replies, `companion_*` device tools |

### Native Android — node broker

On the phone: **Node → Pair as node**. Base URL is the plugin (`http://<magicdns>:8642` or a Tailscale `100.x` address). Setup code is `COMPANION_PAIRING`, or any code if unset (`GET /admin/setup-code`).

`NodePairingClient` sends:

```
POST /pair
{ "setupCode", "publicKey", "nodeName", "nodeModel", "requestedCaps": [...] }
```

Response (camelCase, as the app already parses):

```
{ "nodeId", "token", "expiresAt", "grantedCaps", "brokerUrl" }
```

Empty `brokerUrl` is never returned — it defaults to `ws://<Host>/ws/node`. The app then opens `WebSocketNodeBroker` at that URL with `?token=` and `Authorization: Bearer`.

Wire frames are camelCase JSON: `hello` / `command` / `receipt` / `node.event` / `ack` / `ping` / `pong`.

Posted shade items: `POST /v1/notifications/incoming` as `application/x-www-form-urlencoded` (`package`, `title`, `text`, `posted_at`, `nodeId`) → **202**.

The phone is outbound-only. No public inbound ports. Pairing over cleartext is only accepted by the app on loopback, `.local`, emulator, or a Tailscale address.

## Tools

Hermes can `companion_set_device`, read the shade, open apps, speak, vibrate, and — with on-device approval — place calls, send SMS, or capture a screenshot.

On the native Android companion, prefer `companion_node_command` with a capability family (`device.status`, `notifications.read`, `screen.input`, `apps.launch`, …). The same `companion_*` names also route over the live node socket when one is connected.

## Chat vs node

| Plane | Who | Where |
| --- | --- | --- |
| Hermes chat | profiles, runs, SSE | Hermes gateway (often `:7800`) |
| Companion node | pair, broker, notifications | this plugin `:8642` |
