"""Port interfaces that decouple the domain core from infrastructure."""

from __future__ import annotations

from typing import Any, AsyncIterable, Protocol, Sequence

from .entities import SessionEvent


class MemoryPort(Protocol):
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

    def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate cached user context."""
        ...

    async def upsert_user_persona(
        self,
        *,
        user_id: str,
        native_languages: list[str],
        learning_languages: list[dict[str, str]],
        display_name: str | None = None,
    ) -> None:
        """Persist or update structured user persona information."""
        ...

    async def upsert_partner_profile(
        self,
        *,
        user_id: str,
        partner_profile: dict[str, object],
    ) -> None:
        """Persist partner/relationship metadata for later retrieval."""
        ...

    async def add_feedback_record(
        self,
        *,
        user_id: str,
        record: dict[str, object],
    ) -> None:
        """Store structured feedback record linked to a user."""
        ...

    async def add_profile_facts(
        self,
        *,
        user_id: str,
        facts: list[dict[str, Any]],
    ) -> None:
        """Store automatically extracted profile facts for a user."""
        ...

    async def search_profile_facts(
        self,
        *,
        user_id: str,
        user_hint: str | None = None,
        last_partner_message: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant profile facts for prompt building."""
        ...

    async def add_conversation_messages(
        self,
        thread_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        """Persist conversation messages and optionally return a context block."""
        ...

    async def persist_conversation_insights(
        self,
        *,
        user_id: str,
        thread_id: str,
        insights: dict[str, Any],
        partner_id: str | None = None,
        language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist extracted conversation memories."""
        ...

    async def list_feedback_records(
        self,
        user_id: str,
        language_code: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """List structured feedback records, optionally filtered by language."""
        ...

    async def record_interaction(
        self,
        *,
        user_id: str,
        thread_id: str,
        partner_id: str | None,
        language_code: str | None,
        summary: str | None = None,
        topics: Sequence[str] | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Record an interaction summary for analytics/debugging."""
        ...

    async def get_partner_context(
        self,
        *,
        user_id: str,
        partner_id: str,
        limit: int = 5,
    ) -> str:
        """Return condensed history/context for conversations with a partner."""
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
