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
    # Core suggestion/summarization
    async def suggest(self, transcript_tail: Sequence[str], screen: str | None, memory: Sequence[dict], tone: str, lang: str) -> dict: ...
    async def suggest_unified(self, transcript_tail: Sequence[str], *, target_lang: str, native_lang: str, pronunciation_mode: str | None = None, mode: str = "real", suggest_mode: str = "auto") -> dict: ...
    async def should_suggest(self, transcript_tail: Sequence[str | dict], kind: str, mode: str = "real") -> bool: ...
    async def should_feedback(self, transcript_tail: Sequence[str | dict], user_text: str, mode: str = "real") -> bool: ...
    async def generate_text(self, prompt: str, max_tokens: int = 2000, model: str | None = None) -> str: ...

    # Translation
    async def translate(self, text: str, source_lang: str, target_lang: str) -> str: ...
    async def translate_structured(
        self,
        text: str,
        *,
        source_lang: str,
        target_lang: str,
        pronunciation_mode: str | None = None,
        context: Sequence[str | dict] | None = None,
    ) -> dict: ...

    # Conversation answers/follow-ups
    async def answer(self, transcript_tail: Sequence[str | dict], lang: str, mode: str = "real", target_lang: str | None = None) -> str: ...
    async def follow_up(self, transcript_tail: Sequence[str | dict], lang: str) -> str: ...
    async def answer_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict: ...
    async def follow_up_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict: ...

    # Feedback
    async def feedback(
        self,
        user_text: str,
        lang: str,
        target_lang: str | None = None,
        native_lang: str | None = None,
        mode: str = "real",
        *,
        include_pronunciation: bool = False,
        pronunciation_mode: str | None = None,
        transcript_tail: Sequence[str | dict] | None = None,
    ) -> str: ...

    # Practice mode response
    async def generate_ai_response(
        self,
        user_text: str,
        scenario: str | None,
        conversation_history: Sequence[dict],
        target_lang: str,
    ) -> str: ...

    # Pronunciation (one-line)
    async def generate_pronunciation(
        self,
        target_text: str,
        *,
        native_lang: str,
        target_lang: str,
        mode: str | None = None,
    ) -> str: ...


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
