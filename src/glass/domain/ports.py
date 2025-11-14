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

    async def retrieve(self, session_id: str, query: str, *, k: int = 6) -> Sequence[dict]: ...

    async def get_user_context_block(self, user_id: str, use_cache: bool = True) -> str:
        """Get user-level context (all past conversations) for session start."""
        ...
    
    async def get_context_for_prompt(
        self,
        thread_id: str,
        user_id: str,
        scope: str = "thread",
        timeout: float = 3.0,
    ) -> str:
        """Get context for LLM prompts with timeout and error handling.
        
        Args:
            thread_id: Thread/session ID
            user_id: User ID
            scope: Context scope - "thread" (fast) or "hybrid" (thread + user)
            timeout: Timeout in seconds
        
        Returns:
            Formatted context string
        """
        ...

    async def get_raw_context_block(
        self,
        session_id: str,
        user_id: str | None = None,
    ) -> str:
        """Get thread-level context (current conversation) for LLM prompts.
        
        DEPRECATED: Use get_context_for_prompt() instead.
        """
        ...

    async def add_extracted_memories(
        self,
        user_id: str,
        session_id: str,
        extracted_info: list[dict],
    ) -> None:
        """Add extracted information to memory."""
        ...

    async def warm_user_cache(self, user_id: str) -> None:
        """Warm cache for faster retrieval."""
        ...
    
    def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate cached user context."""
        ...


class ASRPort(Protocol):
    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
        language: str | None = None,
        model: str | None = None,
    ) -> AsyncIterable[dict]: ...


class LLMPort(Protocol):
    # Core suggestion
    async def suggest(
        self,
        *,
        recent_conversation: Sequence[dict],
        target_lang: str,
        native_lang: str,
        user_hint: str | None = None,
        user_context: str | None = None,
        thread_context: str | None = None,
        length_mode: str = "auto",
    ) -> dict | None: ...
    
    async def should_feedback(
        self, 
        recent_conversation: Sequence[dict], 
        user_text: str, 
        mode: str = "real"
    ) -> bool: ...
    
    async def generate_text(self, prompt: str, max_tokens: int = 2000, model: str | None = None) -> str: ...

    # Translation
    async def translate(self, text: str, source_lang: str, target_lang: str) -> str: ...

    # Feedback
    async def feedback(
        self,
        user_text: str,
        lang: str,
        target_lang: str | None = None,
        native_lang: str | None = None,
        mode: str = "real",
        *,
        recent_conversation: Sequence[dict] | None = None,
        user_context: str | None = None,
        thread_context: str | None = None,
        last_suggestion: dict | None = None,
    ) -> str: ...

    # Practice mode response
    async def generate_ai_response(
        self,
        user_text: str,
        scenario: str | None,
        *,
        recent_conversation: Sequence[dict],
        target_lang: str,
        native_lang: str,
        user_context: str | None = None,
        thread_context: str | None = None,
        recent_feedback: str | None = None,
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


class EventsPort(Protocol):
    async def send(self, event: SessionEvent) -> None: ...
