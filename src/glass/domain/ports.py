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
    """Unified LLM interface supporting flexible prompt formats."""
    
    async def call(
        self,
        prompt: str | list[dict] | None = None,
        *,
        messages: list[dict] | None = None,
        system: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        json_mode: bool = False,
    ) -> str:
        """Call LLM with flexible input options.
        
        Args:
            prompt: Simple string prompt or list of messages
            messages: Full message array [{"role": "user", "content": "..."}]
            system: System prompt (prepended to messages)
            model: Model name (uses adapter's default if None)
            temperature: Sampling temperature 0-2
            max_tokens: Max response tokens
            json_mode: Force JSON response
            
        Returns:
            Response text (empty string on error)
        """
        ...


class TTSPort(Protocol):
    """Text-to-Speech interface."""
    
    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        language: str | None = None,
    ) -> AsyncIterable[bytes]:
        """Stream synthesized audio bytes.
        
        Args:
            text: Text to synthesize
            voice_id: Voice ID (uses default if None)
            language: Language code for voice selection
            
        Yields:
            Audio data chunks
        """
        ...


class EventsPort(Protocol):
    async def send(self, event: SessionEvent) -> None: ...
