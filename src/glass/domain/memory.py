"""Memory management for session conversations."""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .ports import MemoryPort

LOGGER = logging.getLogger(__name__)


class ConversationMemory:
    """Handle conversation history and memory context retrieval."""

    def __init__(
        self,
        session_id: str,
        memory: MemoryPort,
    ) -> None:
        self.session_id = session_id
        self.memory = memory
        self.conversation_id: str = session_id
        self._conversation_context_summary: str = ""
        # Conversation storage (unified)
        self.full_conversation: list[dict] = []

        # User context (loaded once at session start)
        self.user_id: str | None = None
        self.user_context_block: str = ""

        # Summary tracking
        self._messages_since_last_summary: int = 0
        self._last_summary_time: float = 0.0

    def upsert_message(self, msg: dict) -> None:
        """Add message in conversation history with canonical shape."""
        normalized = self._normalize_message(msg)
        if not normalized:
            return
        self.full_conversation.append(normalized)

        # Track messages for summary triggering
        self._messages_since_last_summary += 1

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

    def get_conversation_recent_history(self, conversation_id: str | None = None, limit: int = 10) -> list[dict]:
        """Get recent conversation messages.

        Args:
            conversation_id: Conversation ID to fetch history for (currently unused, for future multi-conversation support)
            limit: Maximum number of recent messages to return (default: 10)
        """
        if not self.full_conversation:
            return []
        # Return only the most recent messages for efficiency
        return self.full_conversation[-limit:] if len(self.full_conversation) > limit else list(self.full_conversation)

    def get_conversation_for_summary(self, conversation_id: str | None = None, exclude_recent: int = 6) -> list[dict]:
        """Get conversation history for summarization, excluding the most recent messages.

        This ensures summary and recent_conversation are complementary without gaps or overlap.

        Args:
            conversation_id: Conversation ID to fetch history for (currently unused, for future multi-conversation support)
            exclude_recent: Number of most recent messages to exclude (default: 6)

        Returns:
            All messages except the most recent N
        """
        if not self.full_conversation:
            return []

        # If conversation is short, return empty (will be covered by recent_conversation anyway)
        if len(self.full_conversation) <= exclude_recent:
            return []

        # Return all except the most recent N messages
        return self.full_conversation[:-exclude_recent]

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
            context_block = await self.memory.get_user_context_block(user_id)
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

    async def get_conversation_summary(self, timeout: float = 2.0, *, refresh: bool = False) -> str:  # noqa: ARG002
        """Get accumulated conversation summary.

        Returns the summary generated from conversation history, not the raw messages.
        """
        if not self.user_id:
            return ""
        return self.get_conversation_context_summary()

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

    def update_conversation_context_summary(self, summary: str | None) -> None:
        """Set an explicit summary for this conversation context."""
        if summary is None or not summary.strip():
            return
        self._conversation_context_summary = summary.strip()

        # Reset counters
        self._messages_since_last_summary = 0
        self._last_summary_time = time.time()

    def get_conversation_context_summary(self) -> str:
        """Return the currently cached conversation summary (may be empty)."""
        return self._conversation_context_summary

    def should_update_summary(self, message_threshold: int = 8, time_threshold: float = 300.0) -> bool:
        """Check if summary should be updated based on messages or time.

        Args:
            message_threshold: Update after this many new messages (default: 8)
            time_threshold: Update after this many seconds (default: 300 = 5 minutes)

        Returns:
            True if summary should be updated
        """
        # Update if enough new messages
        if self._messages_since_last_summary >= message_threshold:
            return True

        # Update if enough time has passed and there are new messages
        if self._messages_since_last_summary > 0 and self._last_summary_time > 0:
            elapsed = time.time() - self._last_summary_time
            if elapsed >= time_threshold:
                return True

        return False

    async def build_relationship_context(
        self,
        *,
        partner_id: str | None,
        important_limit: int = 3,
        recent_limit: int = 3,
    ) -> str:
        """Build relationship context from prior memories with this partner.

        Includes all scopes: user, partner, interaction.
        """
        if not self.user_id or not partner_id:
            return ""

        fetch_window = max(important_limit, recent_limit) * 2
        if fetch_window <= 0:
            fetch_window = 4

        try:
            # Get all memories related to this partner (includes user/partner/interaction scopes)
            records = await self.memory.list_partner_memories(
                user_id=self.user_id,
                partner_id=partner_id,
                limit=fetch_window,
            )
        except Exception as e:
            LOGGER.warning(f"[Memory] Failed to fetch partner memories: {e}")
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
                # Limit each summary to 150 chars for prompt efficiency
                truncated = summary[:150] + "..." if len(summary) > 150 else summary
                scope = record.get("scope", "unknown")

                # Add timestamp info for context
                timestamp = _timestamp(record)
                if timestamp > 0:
                    from datetime import datetime, timezone

                    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
                    # Format as relative time (e.g., "2 days ago")
                    now = datetime.now(timezone.utc)
                    delta = now - dt
                    if delta.days > 0:
                        time_str = f"{delta.days} day{'s' if delta.days != 1 else ''} ago"
                    elif delta.seconds >= 3600:
                        hours = delta.seconds // 3600
                        time_str = f"{hours} hour{'s' if hours != 1 else ''} ago"
                    else:
                        time_str = "today"
                    bucket.append(f"- [{scope}, {time_str}] {truncated}")
                else:
                    bucket.append(f"- [{scope}] {truncated}")

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
