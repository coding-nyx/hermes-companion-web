"""Hermes Companion — platform plugin entry."""

from .adapter import register as register_platform
from . import tools


def register(ctx):
    register_platform(ctx)
    for name, schema, handler in tools.TOOL_SPECS:
        ctx.register_tool(name=name, toolset="companion", schema=schema, handler=handler)
