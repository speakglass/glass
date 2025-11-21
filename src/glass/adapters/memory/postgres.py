"""Postgres-backed memory adapter."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import logging

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from ...domain.ports import LLMPort
from ...persistence.db import MemoryRecord, PersistenceDatabase
from .classifier import classify_memory
from .embedder import MemoryEmbedder

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


VALID_SCOPES = {"user", "partner", "interaction"}


def _normalize_scope(value: Any) -> str:
    """Normalize scope to one of: user, partner, interaction."""
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
    scope: str,
    partner_id: str | None,
    conversation_id: str | None,
    text: str,
) -> str:
    normalized = text.lower().strip()
    payload = f"{user_id}|{scope}|{partner_id or ''}|{conversation_id or ''}|{normalized}"
    return hashlib.sha1(payload.encode("utf-8"), usedforsecurity=False).hexdigest()


class PostgresMemoryAdapter:
    """Implements MemoryPort using Postgres with semantic search support."""

    def __init__(
        self,
        *,
        database: PersistenceDatabase,
        llm: LLMPort | None = None,
        embedder: MemoryEmbedder | None = None,
    ) -> None:
        self.database = database
        if llm is None:
            raise ValueError("LLM adapter is required for PostgresMemoryAdapter")
        self.llm = llm
        self.embedder = embedder  # Optional: semantic search only works if embedder is provided

    async def ensure_user(
        self,
        user_id: str,
        email: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> None:  # noqa: ARG002
        """Ensure a user exists for memory operations (Postgres path is a no-op)."""
        return

    async def get_user_context_block(self, user_id: str, *, limit: int = 20) -> str:
        """Get user-scoped memory context.

        Args:
            user_id: User ID
            limit: Maximum number of records to retrieve (default: 20)
        """
        async_session = self.database.session()
        async with async_session() as session:
            records_stmt = (
                select(MemoryRecord)
                .where(
                    MemoryRecord.user_id == user_id,
                    MemoryRecord.conversation_id.is_(None),
                    MemoryRecord.partner_id.is_(None),
                    MemoryRecord.scope == "user",
                )
                .order_by(MemoryRecord.importance.desc(), MemoryRecord.updated_at.desc())
                .limit(limit)
            )
            records = (await session.scalars(records_stmt)).all()

        if not records:
            return ""

        record_lines: list[str] = []
        for record in records:
            prefix = record.category.capitalize()
            line = f"- [{prefix}] {record.text}"
            if record.summary:
                line += f" ({record.summary})"
            record_lines.append(line)

        return "\n".join(record_lines)

    async def persist_memory_records(
        self,
        *,
        user_id: str,
        entries: list[dict[str, Any]],
        partner_id: str | None = None,
        language_code: str | None = None,
        native_language_code: str | None = None,
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
            native_language_code=native_language_code,
            started_at=started_at,
            ended_at=ended_at,
            conversation_id=conversation_id,
        )

    async def _store_records_from_entries(
        self,
        *,
        user_id: str,
        entries: list[dict[str, Any]],
        partner_id: str | None,
        language_code: str | None,
        native_language_code: str | None,
        started_at: float | None,
        ended_at: float | None,
        conversation_id: str | None,
    ) -> None:
        timestamp = _now()
        payloads: list[dict[str, Any]] = []

        async def _build_structured_payload(entry: dict[str, Any]) -> dict[str, Any] | None:
            text = _clean_text(entry.get("text"))
            if not text:
                return None

            # Determine scope: user, partner, or interaction
            scope = _normalize_scope(entry.get("scope"))

            # Check if entry has pre-classified fields
            has_structured_fields = all(key in entry for key in ("category", "retention", "importance"))

            if has_structured_fields:
                # Use provided classification
                record_partner = _normalize_partner_id(entry.get("partner_id")) or partner_id
                entry_conversation_id = entry.get("conversation_id") or conversation_id
                category = _normalize_category(entry.get("category"))
                retention = _normalize_retention(entry.get("retention"))
                importance = _normalize_importance(entry.get("importance"))
                summary = _normalize_summary(entry.get("summary"))
                retention_expires_at = _parse_retention_expiry(entry.get("retention_expires_at"))
            else:
                # Classify with LLM
                classification = await classify_memory(
                    llm=self.llm,
                    user_id=user_id,
                    text=text,
                    scope=scope,
                    native_language=native_language_code,
                )
                record_partner = partner_id
                entry_conversation_id = conversation_id
                category = classification.category
                retention = classification.retention
                importance = classification.importance
                summary = classification.summary or scope.title()
                retention_expires_at = classification.expires_at

            # Generate embedding if embedder is available
            embedding = None
            if self.embedder:
                try:
                    embedding = await self.embedder.embed_memory(text=text)
                except Exception as e:
                    LOGGER.warning(f"[MemoryStore] Failed to generate embedding: {e}")

            payload = {
                "user_id": user_id,
                "partner_id": record_partner,
                "scope": scope,
                "category": category,
                "retention": retention,
                "importance": importance,
                "text": text,
                "summary": summary,
                "retention_expires_at": retention_expires_at,
                "created_at": timestamp,
                "updated_at": timestamp,
                "content_hash": _build_content_hash(
                    user_id=user_id,
                    scope=scope,
                    partner_id=record_partner,
                    conversation_id=entry_conversation_id,
                    text=text,
                ),
            }
            if entry_conversation_id:
                payload["conversation_id"] = entry_conversation_id
            if embedding is not None:
                payload["embedding"] = embedding
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
                "partner_id": stmt.excluded.partner_id,
                "conversation_id": stmt.excluded.conversation_id,
                "scope": stmt.excluded.scope,
                "retention_expires_at": stmt.excluded.retention_expires_at,
                "updated_at": stmt.excluded.updated_at,
            }
            # Only update embedding if it's provided
            if "embedding" in payloads[0]:
                update_cols["embedding"] = stmt.excluded.embedding
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "content_hash"],
                set_=update_cols,
            )
            await session.execute(stmt)
            await session.commit()

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
                "scope": row.scope,
                "category": row.category,
                "retention": row.retention,
                "importance": row.importance,
                "text": row.text,
                "summary": row.summary,
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
                "scope": row.scope,
                "retention": row.retention,
                "importance": row.importance,
                "summary": row.summary,
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
                "scope": row.scope,
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

        # Generate embedding if embedder is available
        embedding = None
        if self.embedder:
            try:
                embedding = await self.embedder.embed_memory(text=text)
            except Exception as e:
                LOGGER.warning(f"[CreateMemory] Failed to generate embedding: {e}")

        payload = {
            "user_id": user_id,
            "partner_id": None,
            "conversation_id": conversation_id,
            "scope": "user",
            "category": classification.category,
            "retention": classification.retention,
            "importance": classification.importance,
            "text": text,
            "summary": classification.summary,
            "retention_expires_at": classification.expires_at,
            "updated_at": _now(),
            "content_hash": _build_content_hash(
                user_id=user_id,
                scope="user",
                partner_id=None,
                conversation_id=conversation_id,
                text=text,
            ),
        }
        if embedding is not None:
            payload["embedding"] = embedding
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
                    "scope": stmt.excluded.scope,
                    "conversation_id": stmt.excluded.conversation_id,
                    "retention_expires_at": stmt.excluded.retention_expires_at,
                    "updated_at": stmt.excluded.updated_at,
                    "embedding": stmt.excluded.embedding,
                },
            ).returning(
                MemoryRecord.id,
                MemoryRecord.scope,
                MemoryRecord.category,
                MemoryRecord.text,
                MemoryRecord.retention,
                MemoryRecord.importance,
                MemoryRecord.summary,
                MemoryRecord.partner_id,
                MemoryRecord.conversation_id,
                MemoryRecord.retention_expires_at,
                MemoryRecord.created_at,
            )
            result = await session.execute(stmt)
            await session.commit()
            row = result.mappings().first()
            if not row:
                raise RuntimeError("Failed to create memory record")
        return {
            "id": row["id"],
            "scope": row["scope"],
            "category": row["category"],
            "text": row["text"],
            "retention": row["retention"],
            "importance": row["importance"],
            "summary": row["summary"],
            "partner_id": row["partner_id"],
            "conversation_id": row["conversation_id"],
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
                select(MemoryRecord.scope).where(
                    MemoryRecord.id == record_id,
                    MemoryRecord.user_id == user_id,
                )
            )
            scope_value = result.scalar_one_or_none()
        if not scope_value:
            raise ValueError("Memory record not found")
        scope = _normalize_scope(scope_value)
        classification = await classify_memory(
            llm=self.llm,
            user_id=user_id,
            text=text,
            scope=scope,
        )

        # Generate new embedding if embedder is available
        embedding = None
        if self.embedder:
            try:
                embedding = await self.embedder.embed_memory(text=text)
            except Exception as e:
                LOGGER.warning(f"[UpdateMemory] Failed to generate embedding: {e}")

        update_values = {
            "text": text,
            "category": classification.category,
            "retention": classification.retention,
            "importance": classification.importance,
            "summary": classification.summary,
            "retention_expires_at": classification.expires_at,
            "updated_at": _now(),
        }
        if embedding is not None:
            update_values["embedding"] = embedding

        async with session_factory() as session:
            stmt = (
                update(MemoryRecord)
                .where(MemoryRecord.id == record_id, MemoryRecord.user_id == user_id)
                .values(**update_values)
                .returning(
                    MemoryRecord.id,
                    MemoryRecord.scope,
                    MemoryRecord.category,
                    MemoryRecord.text,
                    MemoryRecord.retention,
                    MemoryRecord.importance,
                    MemoryRecord.summary,
                    MemoryRecord.partner_id,
                    MemoryRecord.conversation_id,
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
        return {
            "id": row["id"],
            "scope": row["scope"],
            "category": row["category"],
            "text": row["text"],
            "retention": row["retention"],
            "importance": row["importance"],
            "summary": row["summary"],
            "partner_id": row["partner_id"],
            "conversation_id": row["conversation_id"],
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
        return result.rowcount > 0

    async def semantic_search_memories(
        self,
        *,
        user_id: str,
        query_text: str,
        query_context: str | None = None,
        partner_id: str | None = None,
        scopes: list[str] | None = None,
        limit: int = 10,
        similarity_threshold: float = 0.65,
        rerank: bool = True,
    ) -> list[dict[str, Any]]:
        """Semantic search for relevant memories using vector similarity.

        Combines vector similarity search with metadata filtering and optional
        reranking based on importance and recency.

        Args:
            user_id: User ID to search memories for
            query_text: Search query (user message, hint, or last partner message)
            query_context: Optional conversation context for better search
            partner_id: Filter to specific partner's memories
            scopes: Filter by scope (user/partner/interaction)
            limit: Maximum number of results to return
            similarity_threshold: Minimum cosine similarity (0.0-1.0)
            rerank: Whether to rerank by hybrid score (similarity + importance + recency)

        Returns:
            List of memory records with similarity scores
        """
        if not self.embedder:
            LOGGER.warning("[SemanticSearch] Embedder not configured, falling back to empty results")
            return []

        # Generate query embedding
        try:
            query_embedding = await self.embedder.embed_query(
                query=query_text,
                context=query_context,
            )
        except Exception as e:
            LOGGER.error(f"[SemanticSearch] Failed to generate query embedding: {e}", exc_info=True)
            return []

        # Build vector similarity search query
        async_session = self.database.session()
        async with async_session() as session:
            from sqlalchemy import or_, and_

            # Base filters
            filters = [
                MemoryRecord.user_id == user_id,
                MemoryRecord.embedding.isnot(None),
            ]

            # Scope filtering with partner_id logic:
            # - scope="user": include all (no partner_id filter)
            # - scope="partner" or "interaction": only if partner_id matches
            if scopes and partner_id:
                scope_conditions = []

                if "user" in scopes:
                    # User memories: no partner restriction
                    scope_conditions.append(MemoryRecord.scope == "user")

                # Partner/interaction memories: must match partner_id
                partner_scopes = [s for s in scopes if s in ("partner", "interaction")]
                if partner_scopes:
                    scope_conditions.append(
                        and_(MemoryRecord.scope.in_(partner_scopes), MemoryRecord.partner_id == partner_id)
                    )

                if scope_conditions:
                    filters.append(or_(*scope_conditions))
            elif scopes:
                # No partner_id provided: simple scope filter
                filters.append(MemoryRecord.scope.in_(scopes))
            elif partner_id:
                # No scopes provided: simple partner filter
                filters.append(MemoryRecord.partner_id == partner_id)

            # Vector similarity search using cosine distance
            # Note: <=> operator computes cosine distance (0 = identical, 2 = opposite)
            # We convert to similarity: 1 - distance (so 1 = identical, 0 = orthogonal)
            from sqlalchemy import text, cast, Float

            # Fetch more candidates for reranking
            fetch_limit = limit * 2 if rerank else limit

            stmt = (
                select(
                    MemoryRecord,
                    # Cosine similarity score
                    cast(1 - MemoryRecord.embedding.cosine_distance(query_embedding), Float).label("similarity"),
                )
                .where(*filters)
                .where(
                    # Filter by similarity threshold
                    cast(1 - MemoryRecord.embedding.cosine_distance(query_embedding), Float)
                    >= similarity_threshold
                )
                .order_by(
                    # Order by similarity (highest first)
                    cast(1 - MemoryRecord.embedding.cosine_distance(query_embedding), Float).desc()
                )
                .limit(fetch_limit)
            )

            result = await session.execute(stmt)
            rows = result.all()

        if not rows:
            # Debug: Check if there are any results with same filters but no threshold
            debug_stmt = (
                select(
                    MemoryRecord,
                    cast(1 - MemoryRecord.embedding.cosine_distance(query_embedding), Float).label("similarity"),
                )
                .where(*filters)  # Use same filters as main query
                .order_by(cast(1 - MemoryRecord.embedding.cosine_distance(query_embedding), Float).desc())
                .limit(3)
            )
            async_session_debug = self.database.session()
            async with async_session_debug() as session_debug:
                debug_result = await session_debug.execute(debug_stmt)
                debug_rows = debug_result.all()

            if debug_rows:
                # Show scope info in debug
                debug_info = [f"{float(row[1]):.3f}({row[0].scope})" for row in debug_rows[:3]]
                LOGGER.info(
                    f"[SemanticSearch] No results above threshold {similarity_threshold} for query: {query_text[:50]}. "
                    f"Top similarities (scope): {', '.join(debug_info)}"
                )
            else:
                scope_filter = f" scope={scopes}" if scopes else ""
                LOGGER.info(f"[SemanticSearch] No memories with embeddings found for user {user_id}{scope_filter}")
            return []

        # Convert to dict format
        candidates = []
        for row in rows:
            record = row[0]  # MemoryRecord
            similarity = float(row[1])  # similarity score

            candidates.append(
                {
                    "id": record.id,
                    "text": record.text,
                    "summary": record.summary,
                    "scope": record.scope,
                    "category": record.category,
                    "importance": record.importance,
                    "partner_id": record.partner_id,
                    "conversation_id": record.conversation_id,
                    "retention": record.retention,
                    "created_at": record.created_at.isoformat() if record.created_at else None,
                    "updated_at": record.updated_at.isoformat() if record.updated_at else None,
                    "similarity": similarity,
                }
            )

        # Rerank if requested
        if rerank and len(candidates) > limit:
            candidates = self._rerank_results(candidates, limit)
        else:
            candidates = candidates[:limit]

        LOGGER.info(
            f"[SemanticSearch] Found {len(candidates)} results "
            f"(query='{query_text[:50]}...', top_similarity={candidates[0]['similarity']:.3f})"
        )

        return candidates

    def _rerank_results(
        self,
        candidates: list[dict[str, Any]],
        limit: int,
    ) -> list[dict[str, Any]]:
        """Rerank search results using hybrid scoring.

        Combines semantic similarity with metadata signals:
        - Similarity (60%): Semantic relevance to query
        - Importance (30%): User-defined or LLM-classified importance
        - Recency (10%): How recently the memory was updated

        Args:
            candidates: List of candidate memories with similarity scores
            limit: Maximum number of results to return

        Returns:
            Reranked and truncated list of memories
        """
        import time
        from datetime import datetime

        now = time.time()

        for item in candidates:
            # Normalize importance (0-100 → 0-1)
            item["importance_norm"] = item["importance"] / 100.0

            # Normalize recency using exponential decay (30-day half-life)
            if item["updated_at"]:
                try:
                    updated_ts = datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00")).timestamp()
                    days_old = (now - updated_ts) / 86400  # Convert to days
                    # Exponential decay: 0.5^(days/30) gives half-life of 30 days
                    item["recency_norm"] = 0.5 ** (days_old / 30)
                except (ValueError, AttributeError):
                    item["recency_norm"] = 0.0
            else:
                item["recency_norm"] = 0.0

            # Hybrid score: weighted combination
            item["hybrid_score"] = 0.6 * item["similarity"] + 0.3 * item["importance_norm"] + 0.1 * item["recency_norm"]

        # Sort by hybrid score (descending)
        candidates.sort(key=lambda x: x["hybrid_score"], reverse=True)

        return candidates[:limit]
