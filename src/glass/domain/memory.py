"""Memory management for session conversations."""

from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime
from typing import TYPE_CHECKING, Any, Deque

if TYPE_CHECKING:
    from .ports import MemoryPort

LOGGER = logging.getLogger(__name__)


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
        self.conversation_id: str = session_id
        self._conversation_histories: dict[str, Deque[dict]] = {}
        self._conversation_context_summary: str = ""
        # Conversation storage
        self.full_conversation: list[dict] = []

        # User context (loaded once at session start)
        self.user_id: str | None = None
        self.user_context_block: str = ""
        self._ensure_conversation_history(self.conversation_id)

    def upsert_message(self, msg: dict) -> None:
        """Add message in conversation history with canonical shape."""
        normalized = self._normalize_message(msg)
        if not normalized:
            return
        # Keep references aligned so later translation attachments update both views.
        self.full_conversation.append(normalized)
        self._ensure_conversation_history(self.conversation_id).append(normalized)

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
                if conv_msg.get("kind") in {"feedback", "suggestion"} and conv_msg.get("translation"):
                    continue
                conv_msg["translation"] = translation
        for history in self._conversation_histories.values():
            for conv_msg in history:
                if conv_msg.get("utterance_id") == utterance_id:
                    if conv_msg.get("kind") in {"feedback", "suggestion"} and conv_msg.get("translation"):
                        continue
                    conv_msg["translation"] = translation

    def get_conversation_recent_history(self, conversation_id: str | None = None) -> list[dict]:
        """Get recent conversation limited to a specific conversation binding."""
        cid = conversation_id or self.conversation_id
        history = self._conversation_histories.get(cid)
        if not history:
            return []
        return list(history)

    def has_conversation_history(self, conversation_id: str | None = None) -> bool:
        """Check if we have in-session history for a specific conversation."""
        cid = conversation_id or self.conversation_id
        history = self._conversation_histories.get(cid)
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
        self.user_id = user_id
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

    async def get_conversation_context(self, timeout: float = 2.0, *, refresh: bool = False) -> str:  # noqa: ARG002
        """Get conversation-level context for current session."""
        if not self.user_id:
            return ""
        history = self.get_conversation_recent_history(self.conversation_id)
        return self._render_conversation_context(history)

    # Delegate to underlying memory adapter
    async def ensure_user(
        self, user_id: str, email: str | None = None, first_name: str | None = None, last_name: str | None = None
    ) -> None:
        """Ensure user exists in memory system."""
        await self.memory.ensure_user(user_id, email, first_name, last_name)

    async def add_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        """Add conversation messages to memory system."""
        context = await self.memory.add_conversation_messages(
            conversation_id,
            user_id,
            messages,
            session_start_time,
            participants=participants,
            return_context=return_context,
        )
        return context

    async def persist_memory_records(
        self,
        *,
        entries: list[dict[str, Any]] | None,
        conversation_id: str | None = None,
        partner_id: str | None = None,
        language_code: str | None = None,
        native_language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist extracted conversation memories into the backend."""
        if not self.user_id or not entries:
            return
        await self.memory.persist_memory_records(
            user_id=self.user_id,
            conversation_id=conversation_id or self.conversation_id,
            entries=entries,
            partner_id=partner_id,
            language_code=language_code,
            native_language_code=native_language_code,
            started_at=started_at,
            ended_at=ended_at,
        )

    def set_conversation_id(self, conversation_id: str | None) -> None:
        """Update the active memory conversation identifier."""
        self.conversation_id = conversation_id or self.session_id
        self._ensure_conversation_history(self.conversation_id)

    def update_conversation_context_summary(self, summary: str | None) -> None:
        """Set an explicit summary for this conversation context."""
        if summary is None or not summary.strip():
            return
        self._conversation_context_summary = summary.strip()

    def get_conversation_context_summary(self) -> str:
        """Return the currently cached conversation summary (may be empty)."""
        return self._conversation_context_summary

    def _render_conversation_context(self, history: list[dict]) -> str:
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

    async def build_partner_context(
        self,
        *,
        partner_id: str | None,
        important_limit: int = 3,
        recent_limit: int = 3,
    ) -> str:
        """Build a context block using prior durable memories for the current partner."""
        if not self.user_id or not partner_id:
            return ""
        fetch_window = max(important_limit, recent_limit) * 2
        if fetch_window <= 0:
            fetch_window = 4
        try:
            records = await self.memory.list_partner_memories(
                user_id=self.user_id,
                partner_id=partner_id,
                limit=fetch_window,
            )
        except Exception as exc:
            LOGGER.debug("[Memory] Failed to load partner memories: %s", exc)
            return ""
        if not records:
            return ""

        def _summary(record: dict[str, Any]) -> str:
            return (record.get("summary") or record.get("text") or "").strip()

        def _timestamp(record: dict[str, Any]) -> float:
            value = record.get("updated_at") or record.get("created_at")
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
                    return datetime.fromisoformat(normalized).timestamp()
                except ValueError:
                    return 0.0
            return 0.0

        seen: set[str] = set()

        def _collect(items: list[dict[str, Any]], *, limit: int, key_fn) -> list[str]:
            bucket: list[str] = []
            for record in sorted(items, key=key_fn, reverse=True):
                summary = _summary(record)
                if not summary or summary in seen:
                    continue
                bucket.append(f"- {summary}")
                seen.add(summary)
                if len(bucket) >= limit:
                    break
            return bucket

        important = (
            _collect(
                records,
                limit=important_limit,
                key_fn=lambda rec: int(rec.get("importance") or 0),
            )
            if important_limit > 0
            else []
        )
        recent = (
            _collect(
                records,
                limit=recent_limit,
                key_fn=_timestamp,
            )
            if recent_limit > 0
            else []
        )

        parts: list[str] = []
        if important:
            parts.append("Important Notes:\n" + "\n".join(important))
        if recent:
            parts.append("Recent Interactions:\n" + "\n".join(recent))

        return "\n\n".join(parts).strip()

    def _ensure_conversation_history(self, conversation_id: str) -> Deque[dict]:
        """Ensure per-conversation recent history deque exists."""
        history = self._conversation_histories.get(conversation_id)
        if history is None:
            history = deque(maxlen=self.context_window_size)
            self._conversation_histories[conversation_id] = history
        return history
