"""Companion platform adapter.

Listens on the Tailscale / LAN interface so the phone can discover this
gateway via MagicDNS and pair outbound. No extra Python dependencies.

Two planes, do not mix:

- Mailbox ``/companion/*`` — web PWA
- Node broker ``POST /pair`` + ``GET /ws/node`` + ``POST /v1/notifications/incoming``
  — native Android companion (feat/completion)
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Empty, Queue
from typing import Any
from urllib.parse import parse_qs, urlparse

from .node_broker import (
    INCOMING_NOTIFY,
    TOOL_TO_CAP,
    accept_websocket,
    command_node,
    notification_incoming,
    pair_payload,
)
from gateway.config import Platform, PlatformConfig
from gateway.platforms.base import (
    BasePlatformAdapter,
    MessageEvent,
    MessageType,
    SendResult,
)

PORT = int(os.getenv("COMPANION_PORT", "8642"))
BIND = os.getenv("COMPANION_BIND", "0.0.0.0")
LOCK_CODE = os.getenv("COMPANION_PAIRING", "").strip()

# Phone → Hermes
INBOX: Queue = Queue()
# Hermes → phone, keyed by session
OUTBOX: dict[str, Queue] = {}
SESSIONS: dict[str, dict[str, Any]] = {}
RPC_WAIT: dict[str, Queue] = {}
STATE = {"host": socket.gethostname(), "magic": "", "ips": []}


def _tailscale() -> tuple[list[str], str]:
    ips: list[str] = []
    magic = ""
    try:
        ips = subprocess.check_output(["tailscale", "ip", "-4"], text=True, timeout=2).split()
    except Exception:
        pass
    try:
        raw = subprocess.check_output(["tailscale", "status", "--json"], text=True, timeout=2)
        data = json.loads(raw)
        self = data.get("Self") or {}
        extra = self.get("TailscaleIPs") or []
        for ip in extra:
            if ip not in ips:
                ips.append(ip)
        dns = (self.get("DNSName") or "").rstrip(".")
        suffix = (data.get("MagicDNSSuffix") or "").rstrip(".")
        magic = dns or (f"{STATE['host']}.{suffix}" if suffix else "")
    except Exception:
        pass
    return ips, magic


def _json(handler: BaseHTTPRequestHandler, code: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(payload)


def _read(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length") or "0")
    raw = handler.rfile.read(length) if length else b""
    ctype = (handler.headers.get("Content-Type") or "").lower()
    if "application/x-www-form-urlencoded" in ctype:
        parsed = parse_qs(raw.decode("utf-8") if raw else "", keep_blank_values=True)
        return {k: (v[0] if v else "") for k, v in parsed.items()}
    try:
        data = json.loads((raw or b"{}").decode("utf-8") or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _token(handler: BaseHTTPRequestHandler) -> str | None:
    auth = handler.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def do_OPTIONS(self) -> None:  # noqa: N802
        _json(self, 204, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        upgrade = (self.headers.get("Upgrade") or "").lower()
        if path in ("/ws/node", "/companion/ws/node") and "websocket" in upgrade:
            accept_websocket(self)
            return
        if path in ("/companion/hello", "/companion", "/"):
            ips, magic = STATE["ips"], STATE["magic"]
            _json(
                self,
                200,
                {
                    "ok": True,
                    "name": "companion",
                    "label": STATE["host"],
                    "version": "1.1.0",
                    "port": PORT,
                    "magicDns": magic,
                    "tailscaleIps": ips,
                    "pairing": True,
                    "pair": "/pair",
                    "broker": "/ws/node",
                    "mailbox": "/companion",
                    "notifications": "/v1/notifications/incoming",
                },
            )
            return
        if path == "/admin/setup-code":
            code = LOCK_CODE or "(any code from the phone is accepted)"
            _json(self, 200, {"ok": True, "setupCode": code})
            return
        if path == "/companion/outbox":
            tok = _token(self)
            if not tok or tok not in SESSIONS:
                _json(self, 401, {"ok": False, "error": "unpaired"})
                return
            q = OUTBOX.setdefault(tok, Queue())
            batch = []
            try:
                batch.append(q.get(timeout=8))
                while True:
                    batch.append(q.get_nowait())
            except Empty:
                pass
            _json(self, 200, {"ok": True, "messages": batch})
            return
        _json(self, 404, {"ok": False})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        body = _read(self)
        if path in ("/companion/pair", "/pair"):
            # Native Android uses POST /pair (setupCode, publicKey, requestedCaps).
            # The web companion uses POST /companion/pair (code, device).
            if path == "/pair" or "setupCode" in body or "requestedCaps" in body:
                code, payload = pair_payload(body, self.headers.get("Host") or "")
                _json(self, code, payload)
                return
            code = str(body.get("code") or "").strip().upper()
            if LOCK_CODE and code != LOCK_CODE.upper():
                _json(self, 403, {"ok": False, "error": "bad pairing code"})
                return
            if not code:
                _json(self, 400, {"ok": False, "error": "code required"})
                return
            tok = uuid.uuid4().hex
            SESSIONS[tok] = {"code": code, "device": body.get("device") or {}, "at": time.time()}
            OUTBOX[tok] = Queue()
            _json(self, 200, {"ok": True, "session": tok, "host": STATE["magic"] or STATE["host"]})
            return
        if path == "/companion/inbox":
            tok = _token(self)
            if not tok or tok not in SESSIONS:
                _json(self, 401, {"ok": False, "error": "unpaired"})
                return
            messages = body.get("messages") or []
            if isinstance(messages, dict):
                messages = [messages]
            for msg in messages:
                if not isinstance(msg, dict):
                    continue
                kind = msg.get("type")
                if kind == "ping":
                    OUTBOX.setdefault(tok, Queue()).put({"type": "pong", "t": msg.get("t") or int(time.time() * 1000)})
                    continue
                msg["_session"] = tok
                INBOX.put(msg)
                if kind == "tool_result" and msg.get("id") in RPC_WAIT:
                    RPC_WAIT[msg["id"]].put(msg)
            _json(self, 200, {"ok": True})
            return
        if path == "/v1/notifications/incoming":
            result = notification_incoming({str(k): str(v) for k, v in body.items()})
            _json(self, 202, result)
            return
        _json(self, 404, {"ok": False})


_server: ThreadingHTTPServer | None = None


def start_server() -> None:
    global _server
    if _server:
        return
    ips, magic = _tailscale()
    STATE["ips"] = ips
    STATE["magic"] = magic
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    _server = httpd
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()


def rpc(name: str, args: dict[str, Any], timeout: float = 45.0) -> str:
    from .node_broker import _live_node

    rec = _live_node()
    if rec and rec.get("ws") is not None:
        cap = name if "." in name else TOOL_TO_CAP.get(name)
        if cap:
            return command_node(cap, args or {}, timeout)
    if not SESSIONS:
        return json.dumps({"ok": False, "error": "no paired companion"})
    tok = next(iter(SESSIONS))
    call_id = uuid.uuid4().hex
    wait: Queue = Queue()
    RPC_WAIT[call_id] = wait
    OUTBOX.setdefault(tok, Queue()).put({"type": "tool_call", "id": call_id, "name": name, "args": args or {}})
    try:
        msg = wait.get(timeout=timeout)
        return str(msg.get("result") or "")
    except Empty:
        return json.dumps({"ok": False, "error": "phone did not answer"})
    finally:
        RPC_WAIT.pop(call_id, None)


class CompanionAdapter(BasePlatformAdapter):
    def __init__(self, config: PlatformConfig):
        super().__init__(config, Platform("companion"))
        self._pump: threading.Thread | None = None
        self._stop = threading.Event()

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        start_server()
        self._stop.clear()
        self._pump = threading.Thread(target=self._drain, daemon=True)
        self._pump.start()
        self._mark_connected()
        return True

    async def disconnect(self) -> None:
        self._stop.set()
        self._mark_disconnected()

    async def send(self, chat_id, content, reply_to=None, metadata=None):
        text = content if isinstance(content, str) else str(content)
        tok = chat_id if chat_id in SESSIONS else (next(iter(SESSIONS), None))
        if tok:
            OUTBOX.setdefault(tok, Queue()).put(
                {"type": "assistant", "id": uuid.uuid4().hex, "text": text}
            )
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def get_chat_info(self, chat_id):
        return {"name": "Companion", "type": "dm"}

    def _drain(self) -> None:
        while not self._stop.is_set():
            msg = None
            try:
                msg = INBOX.get(timeout=0.25)
            except Empty:
                try:
                    msg = INCOMING_NOTIFY.get(timeout=0.25)
                except Empty:
                    continue
            if not msg:
                continue
            kind = msg.get("type")
            tok = msg.get("_session") or ""
            if kind == "ping":
                OUTBOX.setdefault(tok, Queue()).put({"type": "pong", "t": msg.get("t") or int(time.time() * 1000)})
                continue
            text = ""
            if kind == "user":
                text = str(msg.get("text") or "")
            elif kind == "notify":
                text = (
                    f"[phone notification] {msg.get('app')} — {msg.get('title')}: {msg.get('body')}"
                )
            else:
                continue
            try:
                source = self.build_source(
                    chat_id=tok or "phone",
                    chat_name="Companion",
                    sender_id="phone",
                    sender_name=(SESSIONS.get(tok) or {}).get("device", {}).get("name") or "Phone",
                )
            except Exception:
                source = tok or "phone"
            try:
                event = MessageEvent(
                    text=text,
                    message_type=MessageType.TEXT,
                    source=source,
                    message_id=str(msg.get("id") or uuid.uuid4().hex),
                )
                self.handle_message(event)
            except Exception:
                pass


def check_requirements() -> bool:
    return True


def validate_config(config) -> bool:
    return True


def _env_enablement() -> dict | None:
    seed: dict[str, Any] = {"port": PORT}
    home = os.getenv("COMPANION_HOME_CHANNEL", "phone").strip()
    if home:
        seed["home_channel"] = {"chat_id": home, "name": "Companion"}
    return seed


def register(ctx):
    ctx.register_platform(
        name="companion",
        label="Hermes Companion",
        adapter_factory=lambda cfg: CompanionAdapter(cfg),
        check_fn=check_requirements,
        validate_config=validate_config,
        required_env=[],
        env_enablement_fn=_env_enablement,
        cron_deliver_env_var="COMPANION_HOME_CHANNEL",
        max_message_length=8000,
        platform_hint=(
            "You are chatting through the Hermes Companion on the user's phone. "
            "Use companion_* tools for the web companion mailbox, and "
            "companion_node_command (or capability families like device.status, "
            "notifications.read, screen.input) when the native Android node is paired. "
            "Confirm irreversible actions."
        ),
        emoji="Mobile Phone",
    )
