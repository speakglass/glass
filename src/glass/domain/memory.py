"""Memory management for session conversations."""

from __future__ import annotations

import logging
import time
from collections import deque
from typing import TYPE_CHECKING, Any, Deque, TypedDict

if TYPE_CHECKING:
    from .ports import MemoryPort

LOGGER = logging.getLogger(__name__)


class ConversationInsights(TypedDict, total=False):
    user_insights: list[str]
    partner_insights: list[str]
    interaction_insights: list[str]


class ConversationMemory:
    """Handle conversation history and memory context retrieval."""

    def __init__(
        self,
        session_id: str,
        memory: MemoryPort,
        context_window_size: int = 5,
    ) -> None:
        self.session_id = session_id
        self.memory = memory
        self.context_window_size = context_window_size
        self.thread_id: str = session_id
        self._thread_histories: dict[str, Deque[dict]] = {}
        self._thread_context_cache: str = ""
        self._thread_context_cached_at: float = 0.0
        self._thread_context_ttl: float = 30.0
        self._thread_context_loaded: bool = False
        self._feedback_cache: dict[tuple[str, int], tuple[list[dict[str, Any]], float]] = {}
        self._feedback_cache_ttl: float = 90.0
        self._partner_context_cache: dict[tuple[str, int], tuple[str, float]] = {}
        self._partner_context_ttl: float = 300.0
        self._partner_summary_notes: dict[str, str] = {}

        # Conversation storage
        self.full_conversation: list[dict] = []

        # User context (loaded once at session start)
        self.user_id: str | None = None
        self.user_context_block: str = ""
        self._ensure_thread_history(self.thread_id)

    def upsert_message(self, msg: dict) -> None:
        """Add message in conversation history with canonical shape."""
        normalized = self._normalize_message(msg)
        if not normalized:
            return
        # Keep references aligned so later translation attachments update both views.
        self.full_conversation.append(normalized)
        self._ensure_thread_history(self.thread_id).append(normalized)

    def append_glass_message(self, msg: dict) -> None:
        """Append Glass assistant message (feedback/suggestion) - no updates."""
        normalized = self._normalize_message(msg)
        if normalized:
            self.full_conversation.append(normalized)

    def attach_translation(self, utterance_id: str | None, translation: str | None) -> None:
        """Attach a translation to a stored message when it becomes available."""
        if not utterance_id or not translation:
            return
        for conv_msg in self.full_conversation:
            if conv_msg.get("utterance_id") == utterance_id:
                conv_msg["translation"] = translation
        for history in self._thread_histories.values():
            for conv_msg in history:
                if conv_msg.get("utterance_id") == utterance_id:
                    conv_msg["translation"] = translation

    def get_thread_recent_conversation(self, thread_id: str | None = None) -> list[dict]:
        """Get recent conversation limited to a specific memory thread."""
        tid = thread_id or self.thread_id
        history = self._thread_histories.get(tid)
        if not history:
            return []
        return list(history)

    def has_thread_history(self, thread_id: str | None = None) -> bool:
        """Check if we have in-session history for a specific thread."""
        tid = thread_id or self.thread_id
        history = self._thread_histories.get(tid)
        return bool(history and len(history) > 0)

    def get_full_conversation(self) -> list[dict]:
        """Get complete conversation history."""
        return self.full_conversation

    def _normalize_message(self, msg: dict) -> dict[str, Any] | None:
        """Restrict stored messages to a compact schema and drop sources."""
        if not isinstance(msg, dict):
            return None
        text = (msg.get("text") or "").strip()
        if not text:
            return None

        role = (msg.get("role") or "partner").lower()
        language = (msg.get("language") or "").lower() or None
        timestamp = msg.get("timestamp")
        if timestamp is None:
            timestamp = time.time()

        normalized: dict[str, Any] = {
            "role": role,
            "text": text,
            "timestamp": timestamp,
        }
        if language:
            normalized["language"] = language

        for key in (
            "partner_id",
            "partner_name",
            "is_partner",
            "utterance_id",
            "translation",
            "kind",
            "mode",
            "speaker_type",
            "assistant_type",
            "target_language",
            "native_language",
        ):
            value = msg.get(key)
            if value is not None:
                normalized[key] = value

        return normalized

    async def load_user_context(self, user_id: str) -> None:
        """Load user-level context from memory at session start."""
        reset_caches = user_id != self.user_id
        self.user_id = user_id
        if reset_caches:
            self._feedback_cache.clear()
            self._partner_context_cache.clear()

        try:
            context_block = await self.memory.get_user_context_block(user_id, use_cache=True)
            self.user_context_block = context_block or ""

            if self.user_context_block:
                LOGGER.info(
                    f"[MemoryProcessor] Loaded {len(self.user_context_block)} " f"chars context for user {user_id}"
                )
            else:
                LOGGER.info(f"[MemoryProcessor] No prior context for user {user_id}")
        except Exception as e:
            LOGGER.warning(f"[MemoryProcessor] Failed to load context: {e}")
            self.user_context_block = ""

    async def get_thread_context(self, timeout: float = 2.0, *, refresh: bool = False) -> str:
        """Get thread-level context for current session."""
        if not self.user_id:
            return ""

        if not refresh and self._thread_context_loaded:
            return self._thread_context_cache

        history = self.get_thread_recent_conversation(self.thread_id)
        context = self._render_thread_context(history)
        self.prime_thread_context_cache(context)
        return context

    async def get_hybrid_context(self, timeout: float = 3.0) -> tuple[str, str]:
        """Get both user and thread context.

        Returns:
            (user_context, thread_context)
        """
        thread_context = await self.get_thread_context(timeout=timeout)
        return self.user_context_block, thread_context

    # Delegate to underlying memory adapter (Zep)
    async def ensure_user(
        self, user_id: str, email: str | None = None, first_name: str | None = None, last_name: str | None = None
    ) -> None:
        """Ensure user exists in memory system."""
        await self.memory.ensure_user(user_id, email, first_name, last_name)

    async def ensure_thread(self, thread_id: str, user_id: str) -> None:
        """Ensure thread exists in memory system."""
        await self.memory.ensure_thread(thread_id, user_id)

    async def add_conversation_messages(
        self,
        thread_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        """Add conversation messages to memory system."""
        context = await self.memory.add_conversation_messages(
            thread_id,
            user_id,
            messages,
            session_start_time,
            participants=participants,
            return_context=return_context,
        )
        if context:
            self.prime_thread_context_cache(context)
        return context

    async def persist_conversation_insights(
        self,
        *,
        insights: ConversationInsights | None,
        thread_id: str | None = None,
        partner_id: str | None = None,
        language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist extracted conversation memories into the backend."""
        if not self.user_id or not insights:
            return
        await self.memory.persist_conversation_insights(
            user_id=self.user_id,
            thread_id=thread_id or self.thread_id,
            insights=insights,
            partner_id=partner_id,
            language_code=language_code,
            started_at=started_at,
            ended_at=ended_at,
        )

    def set_thread_id(self, thread_id: str | None) -> None:
        """Update the active memory thread identifier."""
        if thread_id:
            self.thread_id = thread_id
        else:
            self.thread_id = self.session_id
        self._ensure_thread_history(self.thread_id)
        self.invalidate_thread_context_cache()
        self._partner_context_cache.clear()

    def prime_thread_context_cache(self, context: str | None) -> None:
        """Prime the thread context cache using a pre-fetched block."""
        if context is not None:
            self._thread_context_cache = context or ""
            self._thread_context_cached_at = time.time()
            self._thread_context_loaded = True
            return
        self.invalidate_thread_context_cache()

    def invalidate_thread_context_cache(self) -> None:
        """Invalidate the cached thread context."""
        self._thread_context_cache = ""
        self._thread_context_cached_at = 0.0
        self._thread_context_loaded = False

    def _feedback_cache_key(self, language_code: str, limit: int) -> tuple[str, int]:
        return ((language_code or "").lower(), max(limit, 0))

    def _get_cached_feedback_records(self, language_code: str, limit: int) -> list[dict[str, Any]] | None:
        key = self._feedback_cache_key(language_code, limit)
        cached = self._feedback_cache.get(key)
        if not cached:
            return None
        records, cached_at = cached
        if time.time() - cached_at <= self._feedback_cache_ttl:
            return records
        self._feedback_cache.pop(key, None)
        return None

    def _store_feedback_cache(self, language_code: str, limit: int, records: list[dict[str, Any]]) -> None:
        key = self._feedback_cache_key(language_code, limit)
        self._feedback_cache[key] = (records, time.time())

    def _invalidate_feedback_cache(self, language_code: str | None = None) -> None:
        if not language_code:
            self._feedback_cache.clear()
            return
        normalized = (language_code or "").lower()
        keys_to_remove = [key for key in self._feedback_cache if key[0] == normalized]
        for key in keys_to_remove:
            self._feedback_cache.pop(key, None)

    def _partner_context_cache_key(self, partner_id: str, limit: int) -> tuple[str, int]:
        return ((partner_id or "").lower(), max(limit, 0))

    def _get_cached_partner_context(self, partner_id: str, limit: int) -> str | None:
        key = self._partner_context_cache_key(partner_id, limit)
        cached = self._partner_context_cache.get(key)
        if not cached:
            return None
        blob, cached_at = cached
        if time.time() - cached_at <= self._partner_context_ttl:
            return blob
        self._partner_context_cache.pop(key, None)
        return None

    def _store_partner_context(self, partner_id: str, limit: int, context: str) -> None:
        if not partner_id:
            return
        key = self._partner_context_cache_key(partner_id, limit)
        self._partner_context_cache[key] = (context, time.time())

    def update_thread_context_summary(self, summary: str | None) -> None:
        """Set an explicit summary for this thread context."""
        if summary is None or not summary.strip():
            return
        self.prime_thread_context_cache(summary.strip())

    def get_thread_context_summary(self) -> str:
        """Return the currently cached thread summary (may be empty)."""
        return self._thread_context_cache

    def _render_thread_context(self, history: list[dict]) -> str:
        """Convert recent in-session history to a lightweight context string."""
        if not history:
            return ""
        lines: list[str] = []
        for message in history[-6:]:
            role = (message.get("role") or "partner").strip().lower()
            speaker = "You" if role == "user" else "Partner"
            text = (message.get("text") or "").strip()
            if not text:
                continue
            lines.append(f"{speaker}: {text}")
        return "\n".join(lines)

    async def store_partner_summary(self, partner_id: str, summary: str) -> None:
        """Cache a short partner summary for fast roleplay startup."""
        if not partner_id or not summary:
            return
        text = summary.strip()
        if not text:
            return
        normalized = str(partner_id).lower()
        self._partner_summary_notes[normalized] = text
        self._store_partner_context(partner_id, 5, text)

    @property
    def client(self):
        """Access underlying memory client (for advanced operations)."""
        return self.memory.client

    async def upsert_user_persona(
        self,
        *,
        user_id: str,
        native_languages: list[str],
        learning_languages: list[dict[str, str]],
        display_name: str | None = None,
    ) -> None:
        """Persist structured persona data for downstream prompts."""
        await self.memory.upsert_user_persona(
            user_id=user_id,
            native_languages=native_languages,
            learning_languages=learning_languages,
            display_name=display_name,
        )
        self.memory.invalidate_user_cache(user_id)

    async def upsert_partner_profile(
        self,
        *,
        user_id: str,
        partner_profile: dict[str, object],
    ) -> None:
        """Persist partner/relationship metadata for graph queries."""
        await self.memory.upsert_partner_profile(
            user_id=user_id,
            partner_profile=partner_profile,
        )

    async def add_feedback_record(
        self,
        *,
        user_id: str,
        record: dict[str, object],
    ) -> None:
        """Store structured feedback artifacts for later retrieval."""
        await self.memory.add_feedback_record(user_id=user_id, record=record)
        language_code = record.get("language_code")
        if isinstance(language_code, str) and language_code:
            self._invalidate_feedback_cache(language_code)

    async def list_language_feedback(
        self,
        language_code: str,
        *,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Return recent feedback records for the given language."""
        if not self.user_id:
            return []
        cached = self._get_cached_feedback_records(language_code, limit)
        if cached is not None:
            return cached
        try:
            records = await self.memory.list_feedback_records(self.user_id, language_code=language_code, limit=limit)
        except Exception as exc:
            LOGGER.debug("[MemoryProcessor] Failed to list feedback records: %s", exc)
            return []
        self._store_feedback_cache(language_code, limit, records)
        return records

    async def add_profile_facts(self, facts: list[dict[str, Any]]) -> None:
        """Store automatically extracted profile facts."""
        if not self.user_id or not facts:
            return
        try:
            await self.memory.add_profile_facts(user_id=self.user_id, facts=facts)
        except Exception as exc:
            LOGGER.debug("[MemoryProcessor] Failed to add profile facts: %s", exc)

    async def search_profile_facts(
        self,
        *,
        user_hint: str | None = None,
        last_partner_message: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant stored profile facts for prompts."""
        if not self.user_id:
            return []
        try:
            return await self.memory.search_profile_facts(
                user_id=self.user_id,
                user_hint=user_hint,
                last_partner_message=last_partner_message,
                limit=limit,
            )
        except Exception as exc:
            LOGGER.debug("[MemoryProcessor] Failed to search profile facts: %s", exc)
            return []

    async def get_partner_history_context(
        self,
        partner_id: str | None,
        *,
        limit: int = 5,
        refresh: bool = False,
    ) -> str:
        """Get a condensed context block for a specific partner relationship."""
        if not self.user_id or not partner_id:
            return ""
        partner_key = (partner_id or "").lower()
        summary_note = self._partner_summary_notes.get(partner_key)
        if not refresh:
            cached = self._get_cached_partner_context(partner_id, limit)
            if cached is not None:
                if summary_note:
                    prefix = f"Recent Session Summary: {summary_note}"
                    if prefix not in cached:
                        cached = f"{prefix}\n{cached}".strip()
                        self._store_partner_context(partner_id, limit, cached)
                return cached
        try:
            context = await self.memory.get_partner_context(
                user_id=self.user_id,
                partner_id=partner_id,
                limit=limit,
            )
        except Exception as exc:
            LOGGER.debug("[MemoryProcessor] Failed to fetch partner context: %s", exc)
            return ""
        result = context or ""
        if summary_note:
            prefix = f"Recent Session Summary: {summary_note}"
            if prefix not in result:
                result = f"{prefix}\n{result}".strip()
        if result:
            self._store_partner_context(partner_id, limit, result)
        return result

    async def record_interaction(
        self,
        *,
        user_id: str,
        thread_id: str,
        partner_id: str | None,
        language_code: str | None,
        summary: str | None = None,
        topics: list[str] | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Record interaction metadata for long-term analytics."""
        await self.memory.record_interaction(
            user_id=user_id,
            thread_id=thread_id,
            partner_id=partner_id,
            language_code=language_code,
            summary=summary,
            topics=topics,
            started_at=started_at,
            ended_at=ended_at,
        )

    def _ensure_thread_history(self, thread_id: str) -> Deque[dict]:
        """Ensure per-thread recent history deque exists."""
        history = self._thread_histories.get(thread_id)
        if history is None:
            history = deque(maxlen=self.context_window_size)
            self._thread_histories[thread_id] = history
        return history
