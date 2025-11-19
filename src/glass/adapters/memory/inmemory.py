"""In-process memory adapter for tests and lightweight dev environments."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Any


class InMemoryMemoryAdapter:
    """Simple MemoryPort implementation storing data in Python dicts."""

    def __init__(self) -> None:
        self._user_contexts: dict[str, str] = {}
        self._conversation_messages: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=12))
        self._records: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        text = value.strip()
        return text or None

    @staticmethod
    def _timestamp(value: Any) -> float:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
                return datetime.fromisoformat(normalized).timestamp()
            except ValueError:
                return 0.0
        return 0.0

    async def get_user_context_block(self, user_id: str, use_cache: bool = True) -> str:
        return self._user_contexts.get(user_id, "")

    def invalidate_user_cache(self, user_id: str) -> None:
        self._user_contexts.pop(user_id, None)

    async def get_context_for_prompt(
        self, conversation_id: str, user_id: str, scope: str = "conversation", timeout: float = 3.0
    ) -> str:
        messages = list(self._conversation_messages.get(conversation_id, []))
        user_ctx = self._user_contexts.get(user_id, "")
        parts = []
        if scope == "hybrid" and user_ctx:
            parts.append(user_ctx)
        if messages:
            parts.append("\n".join(messages))
        return "\n\n".join(parts).strip()

    async def ensure_user(
        self, user_id: str, email: str | None = None, first_name: str | None = None, last_name: str | None = None
    ) -> None:
        return

    async def add_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        buffer = self._conversation_messages[conversation_id]
        for message in messages:
            text = (message.get("text") or "").strip()
            if text:
                actor = (message.get("role") or "partner").title()
                buffer.append(f"{actor}: {text}")
        if return_context:
            return "\n".join(buffer)
        return None

    def _next_record_id(self) -> str:
        return f"mem-{int(time.time() * 1000)}-{len(self._records) + 1}"

    async def persist_memory_records(
        self,
        *,
        user_id: str,
        entries: list[dict[str, Any]],
        partner_id: str | None = None,
        language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
        conversation_id: str | None = None,
    ) -> None:
        for entry in entries:
            text = self._clean_text(entry.get("text"))
            if not text:
                continue
            record_id = self._next_record_id()
            subject_role = (entry.get("subject_role") or entry.get("scope") or "user").lower()
            if subject_role not in {"user", "partner", "relationship"}:
                subject_role = "user"
            record = {
                "id": record_id,
                "user_id": user_id,
                "conversation_id": entry.get("conversation_id") or entry.get("thread_id") or conversation_id,
                "partner_id": entry.get("partner_id") or partner_id,
                "subject_role": subject_role,
                "category": (entry.get("category") or "fact").lower(),
                "retention": (entry.get("retention") or "long_term").lower(),
                "importance": int(entry.get("importance") or 50),
                "text": text,
                "summary": entry.get("summary"),
                "keywords": list(entry.get("keywords") or []),
                "entities": list(entry.get("entities") or []),
                "retention_expires_at": entry.get("retention_expires_at"),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "updated_at": None,
            }
            self._records[record_id] = record

    async def list_user_memories(
        self,
        *,
        user_id: str,
        limit: int,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        items = [record for record in self._records.values() if record["user_id"] == user_id]
        if search:
            items = [item for item in items if search.lower() in item["text"].lower()]
        total = len(items)
        items = items[offset : offset + limit]
        return items, total

    async def list_conversation_memories(
        self,
        *,
        user_id: str,
        conversation_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        records = [
            record
            for record in self._records.values()
            if record.get("user_id") == user_id and record.get("conversation_id") == conversation_id
        ]
        records.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return records[:limit]

    async def list_partner_memories(
        self,
        *,
        user_id: str,
        partner_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not partner_id:
            return []
        records = [
            record
            for record in self._records.values()
            if record.get("user_id") == user_id and record.get("partner_id") == partner_id
        ]
        records.sort(
            key=lambda item: (
                int(item.get("importance") or 0),
                self._timestamp(item.get("updated_at") or item.get("created_at")),
            ),
            reverse=True,
        )
        return [dict(record) for record in records[:limit]]

    async def create_memory_record(
        self, *, user_id: str, value: str, conversation_id: str | None = None
    ) -> dict[str, Any]:
        if not value:
            raise ValueError("Memory value cannot be empty")
        record_id = self._next_record_id()
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        record = {
            "id": record_id,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "partner_id": None,
            "subject_role": "user",
            "text": value,
            "category": "fact",
            "retention": "long_term",
            "importance": 50,
            "keywords": [],
            "entities": [],
            "summary": None,
            "retention_expires_at": None,
            "created_at": timestamp,
            "updated_at": None,
        }
        self._records[record_id] = record
        return record

    async def update_memory_record(self, *, user_id: str, record_id: str, value: str) -> dict[str, Any]:
        record = self._records.get(record_id)
        if not record or record["user_id"] != user_id:
            raise ValueError("Memory not found")
        record["text"] = value
        record["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return record

    async def delete_memory_record(self, *, user_id: str, record_id: str) -> bool:
        record = self._records.get(record_id)
        if not record or record["user_id"] != user_id:
            return False
        self._records.pop(record_id, None)
        return True
