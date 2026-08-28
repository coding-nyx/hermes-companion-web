"""Node broker for the Android companion (feat/completion).

Implements the edge contract the native app already speaks:

  POST /pair                  NodePairingClient
  GET  /ws/node               WebSocketNodeBroker (RFC 6455, stdlib)
  POST /v1/notifications/incoming   NotificationForwarder (form body)

Commands on the socket are the same capability families as
``NodeCapability.family`` (device.status, notifications.read, screen.input, …).
The PWA mailbox on /companion/* stays untouched.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler
from queue import Empty, Queue
from typing import Any
from urllib.parse import parse_qs, urlparse

LOCK_CODE = os.getenv("COMPANION_PAIRING", "").strip()

# token -> node session
NODES: dict[str, dict[str, Any]] = {}
# nodeId -> token
NODE_IDS: dict[str, str] = {}
# requestId -> Queue for receipts
RECEIPTS: dict[str, Queue] = {}
INCOMING_NOTIFY: Queue = Queue()
LOCK = threading.Lock()

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

CAP_TO_TOOL = {
    "device.status": "get_device_state",
    "device.health": "get_device_state",
    "notifications.read": "read_notifications",
    "notifications.active": "read_notifications",
    "notifications.dismiss": "dismiss_notification",
    "notifications.reply": "notifications_reply",
    "apps.launch": "open_app",
    "clipboard.read": "clipboard_read",
    "clipboard.write": "clipboard_write",
    "app.usage": "app_usage",
    "location.read": "get_location",
    "screen.capture": "capture_screenshot",
    "screen.input": "tap",
    "screen.control": "tap",
    "media.session.control": "media_control",
    "calls.dial": "place_call",
    "messages.sms.send": "send_sms",
    "intents.send": "open_app",
    "system.shell": "shell_exec",
}

TOOL_TO_CAP: dict[str, str] = {}
for _cap, _tool in CAP_TO_TOOL.items():
    TOOL_TO_CAP.setdefault(_tool, _cap)
TOOL_TO_CAP.update(
    {
        "press_key": "screen.input",
        "read_screen": "screen.capture",
        "swipe": "screen.input",
        "type": "screen.input",
        "tap": "screen.input",
        "get_device_state": "device.status",
    }
)

DEFAULT_CAPS = list(CAP_TO_TOOL.keys()) + [
    "contacts.lookup",
    "calls.log",
    "device.apps",
    "device.permissions",
]


def _json_bytes(body: Any) -> bytes:
    return json.dumps(body).encode("utf-8")


def _broker_url(host_header: str) -> str:
    explicit = os.getenv("COMPANION_BROKER_HOST", "").strip()
    if explicit:
        raw = explicit
        if raw.startswith("http://"):
            raw = "ws://" + raw[len("http://") :]
        elif raw.startswith("https://"):
            raw = "wss://" + raw[len("https://") :]
        elif not raw.startswith("ws"):
            port = int(os.getenv("COMPANION_PORT", "8642"))
            raw = f"ws://{raw}:{port}" if ":" not in raw.split("]")[-1] else f"ws://{raw}"
        return raw.rstrip("/") + ("/ws/node" if not raw.rstrip("/").endswith("/ws/node") else "")
    host = (host_header or "").strip()
    if host:
        return f"ws://{host}/ws/node"
    port = int(os.getenv("COMPANION_PORT", "8642"))
    return f"ws://127.0.0.1:{port}/ws/node"


def pair_payload(body: dict[str, Any], host_header: str = "") -> tuple[int, dict[str, Any]]:
    code = str(body.get("setupCode") or body.get("code") or "").strip()
    if LOCK_CODE and code.upper() != LOCK_CODE.upper():
        return 403, {"ok": False, "error": "bad pairing code"}
    if not code:
        return 400, {"ok": False, "error": "setupCode required"}
    requested = body.get("requestedCaps") or DEFAULT_CAPS
    if not isinstance(requested, list):
        requested = DEFAULT_CAPS
    granted = [c for c in requested if isinstance(c, str)] or DEFAULT_CAPS
    token = uuid.uuid4().hex
    node_id = "node_" + uuid.uuid4().hex[:10]
    rec = {
        "token": token,
        "nodeId": node_id,
        "publicKey": str(body.get("publicKey") or ""),
        "nodeName": str(body.get("nodeName") or "Android"),
        "nodeModel": str(body.get("nodeModel") or ""),
        "caps": granted,
        "ws": None,
        "hello": None,
        "at": time.time(),
    }
    with LOCK:
        NODES[token] = rec
        NODE_IDS[node_id] = token
    return 200, {
        "ok": True,
        "nodeId": node_id,
        "token": token,
        "expiresAt": int((time.time() + 86400 * 365) * 1000),
        "grantedCaps": granted,
        "brokerUrl": _broker_url(host_header),
    }


def notification_incoming(fields: dict[str, str]) -> dict[str, Any]:
    pkg = fields.get("package") or "app"
    title = fields.get("title") or ""
    text = fields.get("text") or fields.get("body") or ""
    node_id = fields.get("nodeId") or ""
    posted_at = fields.get("posted_at") or str(int(time.time() * 1000))
    event = {
        "type": "notify",
        "id": uuid.uuid4().hex,
        "app": pkg,
        "title": title,
        "body": text,
        "at": posted_at,
        "nodeId": node_id,
    }
    INCOMING_NOTIFY.put(event)
    tok = NODE_IDS.get(node_id)
    rec = NODES.get(tok or "")
    ws = rec.get("ws") if rec else None
    if ws:
        try:
            ws.send_json(
                {
                    "v": 1,
                    "type": "ack",
                    "eventId": event["id"],
                    "sequence": int(time.time()),
                }
            )
        except Exception:
            pass
    return {"ok": True, "id": event["id"]}


def command_node(capability: str, params: dict[str, Any] | None = None, timeout: float = 45.0) -> str:
    """Push a command frame to the first live Android node and wait for receipt."""
    rec = _live_node()
    if not rec:
        return json.dumps({"ok": False, "error": "no paired android node"})
    ws = rec.get("ws")
    if ws is None:
        return json.dumps({"ok": False, "error": "node socket down"})
    request_id = uuid.uuid4().hex
    wait: Queue = Queue()
    RECEIPTS[request_id] = wait
    frame = {
        "v": 1,
        "type": "command",
        "requestId": request_id,
        "capability": capability,
        "params": params or {},
        "grantId": "plugin",
        "expiresAt": int(time.time() * 1000) + 60_000,
        "profile": "",
    }
    try:
        ws.send_json(frame)
        receipt = wait.get(timeout=timeout)
        if receipt.get("payload") is not None:
            payload = receipt["payload"]
            return payload if isinstance(payload, str) else json.dumps(payload)
        if receipt.get("detail"):
            return str(receipt["detail"])
        return json.dumps({"ok": receipt.get("status") == "completed", "status": receipt.get("status")})
    except Empty:
        return json.dumps({"ok": False, "error": "phone did not answer"})
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})
    finally:
        RECEIPTS.pop(request_id, None)


def _live_node() -> dict[str, Any] | None:
    with LOCK:
        for rec in NODES.values():
            if rec.get("ws") is not None:
                return rec
        return next(iter(NODES.values()), None) if NODES else None


class WsConn:
    def __init__(self, handler: BaseHTTPRequestHandler, token: str):
        self.handler = handler
        self.token = token
        self._w = handler.wfile
        self._r = handler.rfile
        self._lock = threading.Lock()

    def send_json(self, obj: dict[str, Any]) -> None:
        raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
        self.send_bytes(raw)

    def send_bytes(self, payload: bytes, opcode: int = 0x1) -> None:
        header = bytearray()
        header.append(0x80 | (opcode & 0x0F))
        n = len(payload)
        if n < 126:
            header.append(n)
        elif n < 65536:
            header.append(126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", n))
        with self._lock:
            self._w.write(header + payload)
            self._w.flush()

    def read_frame(self) -> tuple[int, bytes] | None:
        hdr = self._r.read(2)
        if not hdr or len(hdr) < 2:
            return None
        opcode = hdr[0] & 0x0F
        masked = (hdr[1] & 0x80) != 0
        length = hdr[1] & 0x7F
        if length == 126:
            ext = self._r.read(2)
            if len(ext) < 2:
                return None
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = self._r.read(8)
            if len(ext) < 8:
                return None
            length = struct.unpack("!Q", ext)[0]
        mask = self._r.read(4) if masked else b""
        data = self._r.read(length) if length else b""
        if masked and mask:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        return opcode, data


def accept_websocket(handler: BaseHTTPRequestHandler) -> None:
    parsed = urlparse(handler.path)
    qs = parse_qs(parsed.query)
    auth = handler.headers.get("Authorization") or ""
    token = ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
    if not token:
        token = (qs.get("token") or [""])[0]
    rec = NODES.get(token)
    if not rec:
        handler.send_error(401, "unpaired")
        return
    key = handler.headers.get("Sec-WebSocket-Key")
    if not key:
        handler.send_error(400, "missing Sec-WebSocket-Key")
        return
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode("ascii")).digest()).decode("ascii")
    handler.send_response(101, "Switching Protocols")
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", accept)
    handler.end_headers()
    ws = WsConn(handler, token)
    rec["ws"] = ws
    try:
        while True:
            frame = ws.read_frame()
            if frame is None:
                break
            opcode, data = frame
            if opcode == 0x8:  # close
                break
            if opcode == 0x9:  # ping
                ws.send_bytes(data, opcode=0xA)
                continue
            if opcode not in (0x1, 0x2):
                continue
            try:
                msg = json.loads(data.decode("utf-8") or "{}")
            except Exception:
                continue
            _handle_node_frame(rec, ws, msg if isinstance(msg, dict) else {})
    finally:
        if rec.get("ws") is ws:
            rec["ws"] = None


def _handle_node_frame(rec: dict[str, Any], ws: WsConn, msg: dict[str, Any]) -> None:
    kind = str(msg.get("type") or "")
    if kind == "hello":
        rec["hello"] = msg
        rec["nodeId"] = msg.get("nodeId") or rec["nodeId"]
        NODE_IDS[rec["nodeId"]] = rec["token"]
        ws.send_json({"v": 1, "type": "ack", "sequence": msg.get("sequence") or 0})
        return
    if kind == "pong":
        return
    if kind == "receipt":
        rid = msg.get("requestId")
        if rid and rid in RECEIPTS:
            RECEIPTS[rid].put(msg)
        return
    if kind == "node.event":
        payload = msg.get("payload") or {}
        cap = msg.get("capability") or ""
        if cap.startswith("notifications") or "title" in payload:
            INCOMING_NOTIFY.put(
                {
                    "type": "notify",
                    "id": msg.get("eventId") or uuid.uuid4().hex,
                    "app": payload.get("package") or payload.get("app") or "app",
                    "title": payload.get("title") or "",
                    "body": payload.get("preview") or payload.get("text") or payload.get("body") or "",
                    "nodeId": rec.get("nodeId") or "",
                }
            )
        ws.send_json({"v": 1, "type": "ack", "eventId": msg.get("eventId"), "sequence": msg.get("sequence")})
        return
    if kind == "ping":
        ws.send_json({"v": 1, "type": "pong"})
