"""Device tools that RPC to the paired companion phone."""

from __future__ import annotations

from typing import Any

from .adapter import rpc


def _schema(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required or [],
            "additionalProperties": False,
        },
    }


def _call(name: str, args: dict[str, Any] | None = None, **kwargs: Any) -> str:
    return rpc(name, args or {})


TOOL_SPECS = [
    (
        "companion_get_device_state",
        _schema("companion_get_device_state", "Read the paired phone: radios, levels, battery, foreground app.", {}),
        lambda args, **kw: _call("get_device_state", args),
    ),
    (
        "companion_set_device",
        _schema(
            "companion_set_device",
            "Change phone settings. Only include fields you want to change.",
            {
                "brightness": {"type": "number"},
                "volume": {"type": "number"},
                "ringer": {"type": "number"},
                "wifi": {"type": "boolean"},
                "bluetooth": {"type": "boolean"},
                "flashlight": {"type": "boolean"},
                "dnd": {"type": "boolean"},
                "airplane": {"type": "boolean"},
                "orientationLock": {"type": "boolean"},
                "nightLight": {"type": "boolean"},
                "locationSharing": {"type": "boolean"},
            },
        ),
        lambda args, **kw: _call("set_device", args),
    ),
    (
        "companion_read_notifications",
        _schema(
            "companion_read_notifications",
            "Read the phone notification shade.",
            {"unreadOnly": {"type": "boolean"}},
        ),
        lambda args, **kw: _call("read_notifications", args),
    ),
    (
        "companion_dismiss_notification",
        _schema("companion_dismiss_notification", "Dismiss a shade item by id.", {"id": {"type": "string"}}, ["id"]),
        lambda args, **kw: _call("dismiss_notification", args),
    ),
    (
        "companion_open_app",
        _schema("companion_open_app", "Launch an installed app by name.", {"name": {"type": "string"}}, ["name"]),
        lambda args, **kw: _call("open_app", args),
    ),
    (
        "companion_press_key",
        _schema("companion_press_key", "Press home, back, or recents.", {"key": {"type": "string"}}, ["key"]),
        lambda args, **kw: _call("press_key", args),
    ),
    (
        "companion_clipboard_read",
        _schema("companion_clipboard_read", "Read the phone clipboard.", {}),
        lambda args, **kw: _call("clipboard_read", args),
    ),
    (
        "companion_clipboard_write",
        _schema("companion_clipboard_write", "Write the phone clipboard.", {"text": {"type": "string"}}, ["text"]),
        lambda args, **kw: _call("clipboard_write", args),
    ),
    (
        "companion_speak",
        _schema("companion_speak", "Speak text on the phone.", {"text": {"type": "string"}}, ["text"]),
        lambda args, **kw: _call("speak", args),
    ),
    (
        "companion_vibrate",
        _schema("companion_vibrate", "Vibrate the phone.", {"pattern": {"type": "string"}}),
        lambda args, **kw: _call("vibrate", args),
    ),
    (
        "companion_media_control",
        _schema("companion_media_control", "Play, pause, next, previous.", {"action": {"type": "string"}}, ["action"]),
        lambda args, **kw: _call("media_control", args),
    ),
    (
        "companion_get_location",
        _schema("companion_get_location", "Read location if sharing is on.", {}),
        lambda args, **kw: _call("get_location", args),
    ),
    (
        "companion_place_call",
        _schema("companion_place_call", "Place a call. The phone will ask for approval.", {"nameOrNumber": {"type": "string"}}, ["nameOrNumber"]),
        lambda args, **kw: _call("place_call", args),
    ),
    (
        "companion_send_sms",
        _schema(
            "companion_send_sms",
            "Send an SMS. The phone will ask for approval.",
            {"to": {"type": "string"}, "body": {"type": "string"}},
            ["to", "body"],
        ),
        lambda args, **kw: _call("send_sms", args),
    ),
    (
        "companion_capture_screenshot",
        _schema("companion_capture_screenshot", "Capture the current screen. Requires approval.", {}),
        lambda args, **kw: _call("capture_screenshot", args),
    ),
    (
        "companion_post_notification",
        _schema(
            "companion_post_notification",
            "Post a notification on the phone from Hermes.",
            {"title": {"type": "string"}, "body": {"type": "string"}, "app": {"type": "string"}},
            ["title", "body"],
        ),
        lambda args, **kw: _call("post_notification", args),
    ),
]
