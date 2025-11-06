"""Port interfaces that decouple the domain core from infrastructure."""

from __future__ import annotations

from typing import AsyncIterable, Iterable, Protocol, Sequence

from .entities import SessionEvent


class MemoryPort(Protocol):
    async def upsert(
        self,
        nodes: Iterable[dict],
        edges: Iterable[tuple[str, str, str]] | None = None,
    ) -> None: ...

    async def retrieve(self, session_id: str, query: str, k: int = 6) -> Sequence[dict]: ...


class ASRPort(Protocol):
    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
    ) -> AsyncIterable[dict]: ...


class LLMPort(Protocol):
    async def suggest(
        self,
        transcript_tail: Sequence[str],
        screen: str | None,
        memory: Sequence[dict],
        tone: str,
        lang: str,
    ) -> dict: ...


class VisionPort(Protocol):
    async def describe(self, session_id: str, image_ref: dict) -> str: ...


class EventsPort(Protocol):
    async def send(self, event: SessionEvent) -> None: ...


class DiarizationPort(Protocol):
    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
    ) -> AsyncIterable[dict]: ...
