"""Postgres-backed memory adapter with Redis caching."""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import logging

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from ...domain.ports import LLMPort
from ...persistence.db import MemoryRecord, PersistenceDatabase
from .classifier import MemoryClassification, classify_memory

LOGGER = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _normalize_partner_id(partner_id: Any | None) -> str | None:
    if not isinstance(partner_id, str):
        return None
    text = partner_id.strip().lower()
    return text or None


VALID_SUBJECT_ROLES = {"user", "partner", "relationship"}
VALID_SCOPES = {"user", "partner", "interaction"}


def _canonical_subject_role(value: Any) -> str | None:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in VALID_SUBJECT_ROLES:
            return lowered
    return None


def _subject_role_from_scope(scope: str) -> str:
    return "relationship" if scope == "interaction" else scope


def _scope_from_subject_role(subject_role: str) -> str:
    return "interaction" if subject_role == "relationship" else subject_role


def _coerce_scope(value: Any) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in VALID_SCOPES:
            return lowered
    return "user"


def _normalize_category(value: Any) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"fact", "preference", "skill", "context", "rule"}:
            return lowered
    return "fact"


def _normalize_retention(value: Any) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"short_term", "long_term", "permanent"}:
            return lowered
    return "long_term"


def _normalize_importance(value: Any) -> int:
    try:
        numeric = int(round(float(value)))
    except (TypeError, ValueError):
        return 50
    return max(0, min(100, numeric))


def _normalize_summary(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        if text:
            return text
    return None


def _coerce_keywords(value: Any, *, limit: int = 16) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []
    keywords: list[str] = []
    for entry in value:
        if isinstance(entry, str):
            text = entry.strip()
            if text:
                keywords.append(text[:64])
        if len(keywords) >= limit:
            break
    return keywords


def _coerce_entities(value: Any, *, limit: int = 16) -> list[dict[str, str]]:
    if not isinstance(value, (list, tuple)):
        return []
    entities: list[dict[str, str]] = []
    for entry in value:
        if isinstance(entry, dict):
            label = str(entry.get("label") or entry.get("type") or "keyword").strip() or "keyword"
            entity_value = (entry.get("value") or entry.get("text") or "").strip()
            if entity_value:
                entities.append({"label": label[:64], "value": entity_value[:256]})
        elif isinstance(entry, str):
            text = entry.strip()
            if text:
                entities.append({"label": "keyword", "value": text[:256]})
        if len(entities) >= limit:
            break
    return entities


def _parse_retention_expiry(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return datetime.now(timezone.utc) + timedelta(days=float(value))
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _build_content_hash(
    *,
    user_id: str,
    subject_role: str,
    partner_id: str | None,
    conversation_id: str | None,
    text: str,
) -> str:
    normalized = text.lower().strip()
    payload = f"{user_id}|{subject_role}|{partner_id or ''}|{conversation_id or ''}|{normalized}"
    return hashlib.sha1(payload.encode("utf-8"), usedforsecurity=False).hexdigest()


class PostgresMemoryAdapter:
    """Implements MemoryPort using SQL + Redis caches."""

    def __init__(
        self,
        *,
        database: PersistenceDatabase,
        redis_client=None,
        cache_ttl: int = 180,
        conversation_context_window: int = 12,
        llm: LLMPort | None = None,
    ) -> None:
        self.database = database
        self.redis = redis_client
        self.cache_ttl = cache_ttl
        self.conversation_context_window = conversation_context_window
        self._local_user_cache: dict[str, tuple[str, float]] = {}
        self._local_conversation_cache: dict[str, tuple[str, float]] = {}
        if llm is None:
            raise ValueError("LLM adapter is required for PostgresMemoryAdapter")
        self.llm = llm

    async def ensure_user(
        self,
        user_id: str,
        email: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> None:  # noqa: ARG002
        """Ensure a user exists for memory operations (Postgres path is a no-op)."""
        return

    # ------------- Cache helpers -------------
    async def _cache_get(self, key: str) -> str | None:
        if not self.redis:
            return None
        try:
            cached = await self.redis.get(key)  # type: ignore[union-attr]
            return cached or None
        except Exception:
            return None

    async def _cache_set(self, key: str, value: str) -> None:
        if not self.redis:
            return
        try:
            await self.redis.set(key, value, ex=self.cache_ttl)  # type: ignore[union-attr]
        except Exception:
            return

    async def _cache_delete(self, key: str) -> None:
        if not self.redis:
            return
        try:
            await self.redis.delete(key)  # type: ignore[union-attr]
        except Exception:
            return

    def _schedule_cache_delete(self, key: str) -> None:
        if not self.redis:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._cache_delete(key))

    def invalidate_user_cache(self, user_id: str) -> None:
        self._local_user_cache.pop(user_id, None)
        self._schedule_cache_delete(f"glass:memory:user:{user_id}")

    def invalidate_conversation_cache(self, conversation_id: str) -> None:
        self._local_conversation_cache.pop(conversation_id, None)
        self._schedule_cache_delete(f"glass:memory:conversation:{conversation_id}")

    async def _invalidate_conversation_cache(self, conversation_id: str) -> None:
        self._local_conversation_cache.pop(conversation_id, None)
        await self._cache_delete(f"glass:memory:conversation:{conversation_id}")

    # ------------- Context builders -------------
    async def get_user_context_block(self, user_id: str, use_cache: bool = True) -> str:
        if use_cache and user_id in self._local_user_cache:
            cached, ts = self._local_user_cache[user_id]
            if _now().timestamp() - ts < self.cache_ttl:
                return cached
        cache_key = f"glass:memory:user:{user_id}"
        if use_cache:
            cached = await self._cache_get(cache_key)
            if cached:
                self._local_user_cache[user_id] = (cached, _now().timestamp())
                return cached

        async_session = self.database.session()
        async with async_session() as session:
            records_stmt = (
                select(MemoryRecord)
                .where(
                    MemoryRecord.user_id == user_id,
                    MemoryRecord.conversation_id.is_(None),
                    MemoryRecord.partner_id.is_(None),
                    MemoryRecord.subject_role == "user",
                )
                .order_by(MemoryRecord.importance.desc(), MemoryRecord.updated_at.desc())
                .limit(50)
            )
            records = (await session.scalars(records_stmt)).all()

        record_lines: list[str] = []
        for record in records:
            prefix = record.category.capitalize()
            line = f"- [{prefix}] {record.text}"
            if record.summary:
                line += f" ({record.summary})"
            record_lines.append(line)

        facts_block = "\n".join(record_lines)
        context = facts_block.strip()
        if context:
            self._local_user_cache[user_id] = (context, _now().timestamp())
            await self._cache_set(cache_key, context)
        return context

    async def _build_conversation_context(self, conversation_id: str, user_id: str) -> str:
        async_session = self.database.session()
        async with async_session() as session:
            record_stmt = (
                select(MemoryRecord)
                .where(
                    MemoryRecord.user_id == user_id,
                    MemoryRecord.conversation_id == conversation_id,
                )
                .order_by(MemoryRecord.importance.desc(), MemoryRecord.updated_at.desc())
                .limit(self.conversation_context_window)
            )
            records = (await session.scalars(record_stmt)).all()

        if not records:
            return ""

        lines: list[str] = []
        for record in records:
            subject = record.subject_role.capitalize()
            summary = record.summary or ""
            snippet = summary if summary else record.text
            lines.append(f"{subject}: {snippet}")
        return "\n".join(lines).strip()

    async def get_context_for_prompt(
        self,
        conversation_id: str,
        user_id: str,
        scope: str = "conversation",
        timeout: float = 3.0,
    ) -> str:
        cache_key = f"glass:memory:conversation:{conversation_id}"
        now_ts = _now().timestamp()
        if scope == "conversation":
            cached_entry = self._local_conversation_cache.get(conversation_id)
            if cached_entry and now_ts - cached_entry[1] < self.cache_ttl:
                return cached_entry[0]
            cached = await self._cache_get(cache_key)
            if cached:
                self._local_conversation_cache[conversation_id] = (cached, now_ts)
                return cached

            try:
                context = await asyncio.wait_for(
                    self._build_conversation_context(conversation_id, user_id), timeout=timeout
                )
            except asyncio.TimeoutError:
                context = ""
            if context:
                self._local_conversation_cache[conversation_id] = (context, now_ts)
                await self._cache_set(cache_key, context)
            return context

        if scope == "hybrid":
            results = await asyncio.gather(
                self.get_context_for_prompt(conversation_id, user_id, scope="conversation", timeout=timeout),
                self.get_user_context_block(user_id, use_cache=True),
                return_exceptions=True,
            )
            thread_ctx = "" if isinstance(results[0], Exception) else results[0]
            user_ctx = "" if isinstance(results[1], Exception) else results[1]
            combined = "\n\n".join(part for part in [user_ctx, thread_ctx] if part)
            return combined.strip()

        # default fallback
        return await self.get_context_for_prompt(conversation_id, user_id, scope="conversation", timeout=timeout)

    # ------------- Persistence helpers -------------
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
        partner_norm = _normalize_partner_id(partner_id)
        await self._store_records_from_entries(
            user_id=user_id,
            entries=entries or [],
            partner_id=partner_norm,
            language_code=language_code,
            started_at=started_at,
            ended_at=ended_at,
            conversation_id=conversation_id,
        )
        self.invalidate_user_cache(user_id)

    async def _store_records_from_entries(
        self,
        *,
        user_id: str,
        entries: list[dict[str, Any]],
        partner_id: str | None,
        language_code: str | None,
        started_at: float | None,
        ended_at: float | None,
        conversation_id: str | None,
    ) -> None:
        timestamp = _now()
        payloads: list[dict[str, Any]] = []
        affected_conversations: set[str] = set()

        async def _build_structured_payload(entry: dict[str, Any]) -> dict[str, Any] | None:
            text = _clean_text(entry.get("text"))
            if not text:
                return None

            has_structured_fields = all(key in entry for key in ("category", "retention", "importance"))
            if has_structured_fields:
                record_partner = _normalize_partner_id(entry.get("partner_id")) or partner_id
                entry_conversation_id = entry.get("conversation_id") or entry.get("thread_id")
                if entry_conversation_id is None:
                    scope_hint = entry.get("thread_scope") or entry.get("conversation_scope")
                    entry_conversation_id = None if scope_hint == "user" else conversation_id
                subject_role = _canonical_subject_role(entry.get("subject_role"))
                if not subject_role:
                    scope_hint = _coerce_scope(entry.get("scope"))
                    subject_role = _subject_role_from_scope(scope_hint)
                category = _normalize_category(entry.get("category"))
                retention = _normalize_retention(entry.get("retention"))
                importance = _normalize_importance(entry.get("importance"))
                summary = _normalize_summary(entry.get("summary"))
                keywords = _coerce_keywords(entry.get("keywords"))
                entities = _coerce_entities(entry.get("entities"))
                retention_expires_at = entry.get("retention_expires_at") or entry.get("expires_at")
                retention_expires_at = _parse_retention_expiry(retention_expires_at)
            else:
                subject_role_from_entry = _canonical_subject_role(entry.get("subject_role"))
                if subject_role_from_entry:
                    subject_role = subject_role_from_entry
                    scope = _scope_from_subject_role(subject_role)
                else:
                    scope = _coerce_scope(entry.get("scope"))
                    subject_role = _subject_role_from_scope(scope)
                classification = await classify_memory(
                    llm=self.llm,
                    user_id=user_id,
                    text=text,
                    scope=scope,
                )
                record_partner = partner_id
                entry_conversation_id = conversation_id
                category = classification.category
                retention = classification.retention
                importance = classification.importance
                summary = classification.summary or scope.title()
                keywords = classification.keywords
                entities = classification.entities
                retention_expires_at = classification.expires_at

            payload = {
                "user_id": user_id,
                "partner_id": record_partner,
                "subject_role": subject_role,
                "category": category,
                "retention": retention,
                "importance": importance,
                "text": text,
                "summary": summary,
                "keywords": keywords or None,
                "entities": entities or None,
                "retention_expires_at": retention_expires_at,
                "created_at": timestamp,
                "updated_at": timestamp,
                "content_hash": _build_content_hash(
                    user_id=user_id,
                    subject_role=subject_role,
                    partner_id=record_partner,
                    conversation_id=entry_conversation_id,
                    text=text,
                ),
            }
            if entry_conversation_id:
                payload["conversation_id"] = entry_conversation_id
                affected_conversations.add(entry_conversation_id)
            return payload

        for entry in entries:
            payload = await _build_structured_payload(entry)
            if payload:
                payloads.append(payload)

        if not payloads:
            return

        async_session = self.database.session()
        async with async_session() as session:
            stmt = insert(MemoryRecord).values(payloads)
            update_cols = {
                "importance": stmt.excluded.importance,
                "retention": stmt.excluded.retention,
                "summary": stmt.excluded.summary,
                "keywords": stmt.excluded.keywords,
                "entities": stmt.excluded.entities,
                "partner_id": stmt.excluded.partner_id,
                "conversation_id": stmt.excluded.conversation_id,
                "subject_role": stmt.excluded.subject_role,
                "retention_expires_at": stmt.excluded.retention_expires_at,
                "updated_at": stmt.excluded.updated_at,
            }
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "content_hash"],
                set_=update_cols,
            )
            await session.execute(stmt)
            await session.commit()

        for convo_id in affected_conversations:
            await self._invalidate_conversation_cache(convo_id)

    async def list_user_memories(
        self,
        *,
        user_id: str,
        limit: int,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        async_session = self.database.session()
        async with async_session() as session:
            base_stmt = select(MemoryRecord).where(MemoryRecord.user_id == user_id)
            if search:
                base_stmt = base_stmt.where(MemoryRecord.text.ilike(f"%{search}%"))
            total_stmt = base_stmt.with_only_columns(func.count()).order_by(None)
            total = await session.scalar(total_stmt) or 0
            stmt = base_stmt.order_by(MemoryRecord.updated_at.desc()).offset(offset).limit(limit)
            rows = (await session.scalars(stmt)).all()
        items = [
            {
                "id": row.id,
                "subject_role": row.subject_role,
                "category": row.category,
                "retention": row.retention,
                "importance": row.importance,
                "text": row.text,
                "summary": row.summary,
                "keywords": row.keywords,
                "entities": row.entities,
                "partner_id": row.partner_id,
                "conversation_id": row.conversation_id,
                "retention_expires_at": row.retention_expires_at.isoformat() if row.retention_expires_at else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
        return items, int(total)

    async def list_conversation_memories(
        self,
        *,
        user_id: str,
        conversation_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        if not conversation_id:
            return []
        async_session = self.database.session()
        async with async_session() as session:
            stmt = (
                select(MemoryRecord)
                .where(
                    MemoryRecord.user_id == user_id,
                    MemoryRecord.conversation_id == conversation_id,
                )
                .order_by(MemoryRecord.updated_at.desc(), MemoryRecord.importance.desc())
                .limit(limit)
            )
            rows = (await session.scalars(stmt)).all()
        return [
            {
                "id": row.id,
                "text": row.text,
                "category": row.category,
                "subject_role": row.subject_role,
                "retention": row.retention,
                "importance": row.importance,
                "summary": row.summary,
                "keywords": row.keywords,
                "entities": row.entities,
                "partner_id": row.partner_id,
                "conversation_id": row.conversation_id,
                "retention_expires_at": row.retention_expires_at.isoformat() if row.retention_expires_at else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]

    async def list_partner_memories(
        self,
        *,
        user_id: str,
        partner_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not partner_id:
            return []
        async_session = self.database.session()
        async with async_session() as session:
            stmt = (
                select(MemoryRecord)
                .where(
                    MemoryRecord.user_id == user_id,
                    MemoryRecord.partner_id == partner_id,
                )
                .order_by(
                    MemoryRecord.importance.desc(),
                    func.coalesce(MemoryRecord.updated_at, MemoryRecord.created_at).desc(),
                    MemoryRecord.created_at.desc(),
                )
                .limit(limit)
            )
            rows = (await session.scalars(stmt)).all()
        return [
            {
                "id": row.id,
                "text": row.text,
                "summary": row.summary,
                "category": row.category,
                "subject_role": row.subject_role,
                "importance": row.importance,
                "partner_id": row.partner_id,
                "conversation_id": row.conversation_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]

    async def create_memory_record(
        self,
        *,
        user_id: str,
        value: str,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        text = _clean_text(value)
        if not text:
            raise ValueError("Memory value cannot be empty")
        classification = await classify_memory(
            llm=self.llm,
            user_id=user_id,
            text=text,
            scope="user",
        )
        payload = {
            "user_id": user_id,
            "partner_id": None,
            "conversation_id": conversation_id,
            "subject_role": "user",
            "category": classification.category,
            "retention": classification.retention,
            "importance": classification.importance,
            "text": text,
            "summary": classification.summary,
            "keywords": classification.keywords,
            "entities": classification.entities,
            "retention_expires_at": classification.expires_at,
            "updated_at": _now(),
            "content_hash": _build_content_hash(
                user_id=user_id,
                subject_role="user",
                partner_id=None,
                conversation_id=conversation_id,
                text=text,
            ),
        }
        async_session = self.database.session()
        async with async_session() as session:
            stmt = insert(MemoryRecord).values(payload)
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "content_hash"],
                set_={
                    "category": stmt.excluded.category,
                    "retention": stmt.excluded.retention,
                    "importance": stmt.excluded.importance,
                    "text": stmt.excluded.text,
                    "keywords": stmt.excluded.keywords,
                    "entities": stmt.excluded.entities,
                    "subject_role": stmt.excluded.subject_role,
                    "conversation_id": stmt.excluded.conversation_id,
                    "retention_expires_at": stmt.excluded.retention_expires_at,
                    "updated_at": stmt.excluded.updated_at,
                },
            ).returning(
                MemoryRecord.id,
                MemoryRecord.subject_role,
                MemoryRecord.category,
                MemoryRecord.text,
                MemoryRecord.retention,
                MemoryRecord.importance,
                MemoryRecord.summary,
                MemoryRecord.partner_id,
                MemoryRecord.conversation_id,
                MemoryRecord.keywords,
                MemoryRecord.entities,
                MemoryRecord.retention_expires_at,
                MemoryRecord.created_at,
            )
            result = await session.execute(stmt)
            await session.commit()
            row = result.mappings().first()
            if not row:
                raise RuntimeError("Failed to create memory record")
        self.invalidate_user_cache(user_id)
        return {
            "id": row["id"],
            "subject_role": row["subject_role"],
            "category": row["category"],
            "text": row["text"],
            "retention": row["retention"],
            "importance": row["importance"],
            "summary": row["summary"],
            "partner_id": row["partner_id"],
            "conversation_id": row["conversation_id"],
            "keywords": row["keywords"],
            "entities": row["entities"],
            "retention_expires_at": row["retention_expires_at"].isoformat() if row["retention_expires_at"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }

    async def update_memory_record(
        self,
        *,
        user_id: str,
        record_id: str,
        value: str,
    ) -> dict[str, Any]:
        text = _clean_text(value)
        if not text:
            raise ValueError("Updated memory cannot be empty")
        session_factory = self.database.session()
        async with session_factory() as session:
            result = await session.execute(
                select(MemoryRecord.subject_role).where(
                    MemoryRecord.id == record_id,
                    MemoryRecord.user_id == user_id,
                )
            )
            subject_role_value = result.scalar_one_or_none()
        if not subject_role_value:
            raise ValueError("Memory record not found")
        subject_role = _canonical_subject_role(subject_role_value) or "user"
        scope_hint = _scope_from_subject_role(subject_role)
        classification = await classify_memory(
            llm=self.llm,
            user_id=user_id,
            text=text,
            scope=scope_hint,
        )
        async with session_factory() as session:
            stmt = (
                update(MemoryRecord)
                .where(MemoryRecord.id == record_id, MemoryRecord.user_id == user_id)
                .values(
                    text=text,
                    category=classification.category,
                    retention=classification.retention,
                    importance=classification.importance,
                    keywords=classification.keywords,
                    entities=classification.entities,
                    summary=classification.summary,
                    retention_expires_at=classification.expires_at,
                    updated_at=_now(),
                )
                .returning(
                    MemoryRecord.id,
                    MemoryRecord.subject_role,
                    MemoryRecord.category,
                    MemoryRecord.text,
                    MemoryRecord.retention,
                    MemoryRecord.importance,
                    MemoryRecord.summary,
                    MemoryRecord.partner_id,
                    MemoryRecord.conversation_id,
                    MemoryRecord.keywords,
                    MemoryRecord.entities,
                    MemoryRecord.retention_expires_at,
                    MemoryRecord.updated_at,
                )
            )
            result = await session.execute(stmt)
            row = result.mappings().first()
            if not row:
                await session.rollback()
                raise ValueError("Memory not found")
            await session.commit()
        self.invalidate_user_cache(user_id)
        return {
            "id": row["id"],
            "subject_role": row["subject_role"],
            "category": row["category"],
            "text": row["text"],
            "retention": row["retention"],
            "importance": row["importance"],
            "summary": row["summary"],
            "partner_id": row["partner_id"],
            "conversation_id": row["conversation_id"],
            "keywords": row["keywords"],
            "entities": row["entities"],
            "retention_expires_at": row["retention_expires_at"].isoformat() if row["retention_expires_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }

    async def delete_memory_record(
        self,
        *,
        user_id: str,
        record_id: str,
    ) -> bool:
        async_session = self.database.session()
        async with async_session() as session:
            stmt = delete(MemoryRecord).where(MemoryRecord.id == record_id, MemoryRecord.user_id == user_id)
            result = await session.execute(stmt)
            await session.commit()
        deleted = result.rowcount > 0
        if deleted:
            self.invalidate_user_cache(user_id)
        return deleted
