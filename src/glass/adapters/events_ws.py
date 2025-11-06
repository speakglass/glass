"""Event adapters for WebSocket delivery."""

from __future__ import annotations

from fastapi import WebSocket

from ..domain.entities import SessionEvent


class WebSocketEventsAdapter:
    """Forward events to a FastAPI WebSocket."""

    def __init__(self, websocket: WebSocket) -> None:
        self.websocket = websocket

    async def send(self, event: SessionEvent) -> None:
        payload = {"t": event.type.value, "sid": event.session_id, **event.payload}
        if event.sequence is not None:
            payload["seq"] = event.sequence
        await self.websocket.send_json(payload)


class NullEventsAdapter:
    """Drop all outbound events."""

    async def send(self, event: SessionEvent) -> None:  # pragma: no cover - trivial
        return
