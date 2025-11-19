"""Port interfaces that decouple the domain core from infrastructure."""

from __future__ import annotations

from typing import Any, AsyncIterable, Protocol, Sequence

from .entities import SessionEvent


class MemoryPort(Protocol):
    async def ensure_user(
        self,
        user_id: str,
        email: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> None:
        """Ensure backing store knows about a user."""
        ...

    async def get_user_context_block(self, user_id: str, use_cache: bool = True) -> str:
        """Get user-level context (all past conversations) for session start."""
        ...
    
    async def get_context_for_prompt(
        self,
        conversation_id: str,
        user_id: str,
        scope: str = "conversation",
        timeout: float = 3.0,
    ) -> str:
        """Get summarized context for a conversation."""
        ...

    def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate cached user context."""
        ...

    async def add_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        """Persist conversation messages and optionally return a context block."""
        ...

    async def persist_memory_records(
        self,
        *,
        user_id: str,
        conversation_id: str | None,
        entries: list[dict[str, Any]],
        partner_id: str | None = None,
        language_code: str | None = None,
        native_language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist structured memory records derived from a conversation."""
        ...

    async def list_conversation_memories(
        self,
        *,
        user_id: str,
        conversation_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Return memory records associated with a specific conversation id."""
        ...

    async def list_user_memories(
        self,
        *,
        user_id: str,
        limit: int,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """List stored memory records for manual review."""
        ...

    async def list_partner_memories(
        self,
        *,
        user_id: str,
        partner_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """List stored memory records tied to a specific partner."""
        ...

    async def create_memory_record(
        self,
        *,
        user_id: str,
        value: str,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new durable memory record."""
        ...

    async def update_memory_record(
        self,
        *,
        user_id: str,
        record_id: str,
        value: str,
    ) -> dict[str, Any]:
        """Update an existing memory record."""
        ...

    async def delete_memory_record(
        self,
        *,
        user_id: str,
        record_id: str,
    ) -> bool:
        """Delete a stored memory record."""
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
