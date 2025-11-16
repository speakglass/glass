"""Memory management for session conversations."""

from __future__ import annotations

import logging
import time
from collections import deque
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
        self.thread_id: str = session_id
        
        # Conversation storage
        self.tail: Deque[dict] = deque(maxlen=context_window_size)
        self.full_conversation: list[dict] = []
        
        # User context (loaded once at session start)
        self.user_id: str | None = None
        self.user_context_block: str = ""

    def upsert_message(self, msg: dict) -> None:
        """Add message in conversation history with canonical shape."""
        normalized = self._normalize_message(msg)
        if not normalized:
            return
        # Keep references aligned so later translation attachments update both views.
        self.tail.append(normalized)
        self.full_conversation.append(normalized)

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
        for conv_msg in self.tail:
            if conv_msg.get("utterance_id") == utterance_id:
                conv_msg["translation"] = translation

    def get_recent_conversation(self) -> list[dict]:
        """Get recent N messages from tail."""
        return list(self.tail)

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

        for key in ("partner_id", "partner_name", "utterance_id", "translation", "kind", "mode"):
            value = msg.get(key)
            if value is not None:
                normalized[key] = value

        return normalized

    async def load_user_context(self, user_id: str) -> None:
        """Load user-level context from memory at session start."""
        self.user_id = user_id
        try:
            context_block = await self.memory.get_user_context_block(
                user_id, use_cache=True
            )
            self.user_context_block = context_block or ""
            
            if self.user_context_block:
                LOGGER.info(
                    f"[MemoryProcessor] Loaded {len(self.user_context_block)} "
                    f"chars context for user {user_id}"
                )
            else:
                LOGGER.info(
                    f"[MemoryProcessor] No prior context for user {user_id}"
                )
        except Exception as e:
            LOGGER.warning(f"[MemoryProcessor] Failed to load context: {e}")
            self.user_context_block = ""

    async def get_thread_context(self, timeout: float = 2.0) -> str:
        """Get thread-level context for current session."""
        if not self.user_id:
            return ""
        
        try:
            return await self.memory.get_context_for_prompt(
                thread_id=self.thread_id,
                user_id=self.user_id,
                scope="thread",
                timeout=timeout,
            )
        except Exception as e:
            LOGGER.warning(f"[MemoryProcessor] Failed to get thread context: {e}")
            return ""

    async def get_hybrid_context(self, timeout: float = 3.0) -> tuple[str, str]:
        """Get both user and thread context.
        
        Returns:
            (user_context, thread_context)
        """
        thread_context = await self.get_thread_context(timeout)
        return self.user_context_block, thread_context

    # Delegate to underlying memory adapter (Zep)
    async def ensure_user(self, user_id: str, email: str | None = None, 
                         first_name: str | None = None, last_name: str | None = None) -> None:
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
        participants: dict[str, dict[str, str]] | None = None,
    ) -> None:
        """Add conversation messages to memory system."""
        await self.memory.add_conversation_messages(
            thread_id,
            user_id,
            messages,
            session_start_time,
            participants=participants,
        )
    
    def set_thread_id(self, thread_id: str | None) -> None:
        """Update the active memory thread identifier."""
        if thread_id:
            self.thread_id = thread_id
        else:
            self.thread_id = self.session_id
    
    @property
    def client(self):
        """Access underlying memory client (for advanced operations)."""
        return self.memory.client
