"""No-op vision adapter."""

from __future__ import annotations


class NullVisionAdapter:
    async def describe(self, session_id: str, image_ref: dict) -> str:
        return ""
