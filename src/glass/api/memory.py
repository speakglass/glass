"""Memory API routes - Zep Cloud Knowledge Graph integration."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from zep_cloud.core.api_error import ApiError

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..adapters.memory.schema import build_conversation_fact_payload

router = APIRouter(prefix="/memories", tags=["memory"])
logger = logging.getLogger(__name__)

CONVERSATION_FACT_LABEL = "ConversationFact"
MANUAL_FACT_CATEGORY = "manual_profile"


# ===== Request/Response Models =====


class ZepMemoryResponse(BaseModel):
    """Memory item from Zep Knowledge Graph - matches Zep's edge structure."""

    id: str  # Zep edge UUID
    name: str | None = None  # Edge name/type (e.g., "LIKES", "KNOWS")
    fact: str  # The actual fact text
    created_at: str | None = None  # ISO timestamp
    valid_at: str | None = None  # When the fact became valid
    invalid_at: str | None = None  # When the fact became invalid
    expired_at: str | None = None  # When the fact expired


class ZepMemoryListResponse(BaseModel):
    """List of memories with pagination."""

    items: list[ZepMemoryResponse]
    total: int
    limit: int
    offset: int


class BulkDeleteResponse(BaseModel):
    deleted: int
    failed: list[str] = Field(default_factory=list)


class CreateMemoryRequest(BaseModel):
    """Request to create a new memory."""

    value: str = Field(..., description="The fact to remember")


class UpdateMemoryRequest(BaseModel):
    """Request to update a memory."""

    value: str | None = None
    label: str | None = None


# ===== API Endpoints =====


@router.get("", response_model=ZepMemoryListResponse)
async def list_user_memories(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
):
    """List all memories for the user from Zep Knowledge Graph.

    Note: Zep's limit is capped at 50 items per request.
    """
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter

    try:
        docs = await _fetch_user_fact_documents(
            memory_adapter,
            user_id=user.user_id,
            limit=limit + offset,
            search=search,
        )
        docs.sort(key=lambda doc: _parse_iso_to_epoch(doc.get("updated_at")), reverse=True)
        paginated = docs[offset : offset + limit]
        items = [_document_to_response(doc) for doc in paginated]

        logger.info(f"[Memory] Listed {len(items)} memories for user {user.user_id}")

        return ZepMemoryListResponse(
            items=items,
            total=len(docs),
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        logger.error(f"[Memory] Failed to list memories: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list memories: {str(e)}")


@router.post("", response_model=list[ZepMemoryResponse], status_code=201)
async def create_user_memory(
    request: Request,
    data: list[CreateMemoryRequest],
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
):
    """Create new memories in Zep Knowledge Graph."""
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter

    try:
        # Ensure user exists in Zep
        if user.name:
            name_parts = user.name.split()
            first_name = name_parts[0]
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else None
        else:
            first_name = None
            last_name = None

        await memory_adapter.ensure_user(
            user_id=user.user_id,
            email=user.email,
            first_name=first_name,
            last_name=last_name,
        )

        results = []

        for memory_data in data:
            text_value = (memory_data.value or "").strip()
            if not text_value:
                continue
            try:
                payload, document_payload = _manual_memory_payload(user, text_value)
                doc_id = await memory_adapter.add_graph_document(
                    user_id=user.user_id,
                    payload=payload,
                    thread_id=None,
                )
                if not doc_id:
                    raise RuntimeError("document insertion failed")
                document_payload["id"] = doc_id
                results.append(_document_to_response(document_payload))
            except Exception as exc:
                logger.error("[Memory] Failed to store manual memory for %s: %s", user.user_id, exc, exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to store memory") from exc

        logger.info(f"[Memory] Created {len(results)} memories for user {user.user_id}")
        memory_adapter.invalidate_user_cache(user.user_id)
        return results

    except Exception as e:
        logger.error(f"[Memory] Failed to create memory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create memory: {str(e)}")


@router.patch("/{memory_id}", response_model=ZepMemoryResponse)
async def update_user_memory(
    request: Request,
    memory_id: str,  # Zep edge UUID
    data: UpdateMemoryRequest,
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
):
    """Update a memory (delete old + create new, since Zep doesn't support direct updates)."""
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter

    try:
        new_value = (data.value or "").strip()
        if not new_value:
            raise HTTPException(status_code=400, detail="Updated memory cannot be empty")

        deleted = await _delete_graph_memory(memory_adapter, user.user_id, memory_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Memory not found")

        payload, document_payload = _manual_memory_payload(user, new_value)
        try:
            new_id = await memory_adapter.add_graph_document(
                user_id=user.user_id,
                payload=payload,
                thread_id=None,
            )
            if not new_id:
                raise RuntimeError("document insertion failed")
            document_payload["id"] = new_id
        except Exception as exc:
            logger.error(f"[Memory] Failed to recreate memory {memory_id}: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to update memory") from exc

        logger.info(f"[Memory] Updated manual memory {memory_id} -> {new_id} for user {user.user_id}")
        memory_adapter.invalidate_user_cache(user.user_id)
        return _document_to_response(document_payload)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Memory] Failed to update memory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update memory: {str(e)}")


@router.delete("/{memory_id}", status_code=204)
async def delete_user_memory(
    request: Request,
    memory_id: str,  # Zep edge UUID
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
):
    """Delete a memory from Zep Knowledge Graph."""
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter

    success = await _delete_graph_memory(memory_adapter, user.user_id, memory_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete memory from graph")
    memory_adapter.invalidate_user_cache(user.user_id)


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_memories(
    request: Request,
    memory_ids: Annotated[list[str], Body(embed=True)],
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> BulkDeleteResponse:
    """Delete multiple memories at once."""
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter

    async def delete_single(memory_id: str) -> tuple[str, bool]:
        try:
            success = await _delete_graph_memory(memory_adapter, user.user_id, memory_id)
            return memory_id, success
        except Exception as e:
            logger.error(f"[Memory] Unexpected error deleting {memory_id}: {e}", exc_info=True)
            return memory_id, False

    tasks = [delete_single(memory_id) for memory_id in memory_ids]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    deleted_count = 0
    errors: list[str] = []
    for memory_id, success in results:
        if success:
            deleted_count += 1
        else:
            errors.append(memory_id)

    logger.info(
        f"[Memory] Bulk deleted {deleted_count}/{len(memory_ids)} memories "
        f"for user {user.user_id}. failures={len(errors)}"
    )
    if deleted_count:
        memory_adapter.invalidate_user_cache(user.user_id)
    return BulkDeleteResponse(deleted=deleted_count, failed=errors)


async def _delete_graph_memory(memory_adapter, user_id: str, memory_id: str) -> bool:
    delete_doc = getattr(memory_adapter, "delete_graph_document", None)
    if callable(delete_doc):
        success = await delete_doc(user_id=user_id, document_id=memory_id)
        if success:
            logger.info(f"[Memory] Deleted graph document {memory_id} for user {user_id}")
            return True
    try:
        await memory_adapter.client.graph.edge.delete(uuid_=memory_id)
        logger.info(f"[Memory] Deleted graph edge {memory_id} for user {user_id}")
        return True
    except Exception as edge_error:
        logger.error(
            f"[Memory] Failed to delete memory {memory_id} via edge delete: {edge_error}",
            exc_info=True,
        )
        return False
    return False


def _manual_memory_payload(user: AuthenticatedUser, value: str) -> tuple[Any, dict[str, Any]]:
    timestamp = datetime.now(timezone.utc)
    payload = build_conversation_fact_payload(
        value=value,
        subject_type="user",
        subject_id=user.user_id,
        category=MANUAL_FACT_CATEGORY,
        updated_at=timestamp,
    )
    document_payload = {
        "value": value,
        "subject_type": "user",
        "subject_id": user.user_id,
        "category": MANUAL_FACT_CATEGORY,
        "updated_at": timestamp.isoformat(),
    }
    return payload, document_payload


def _normalize_fact_document(document: dict[str, Any]) -> dict[str, Any]:
    """Clean up Zep nodes to make sure metadata fields are usable."""

    def _clean_value(value: Any) -> Any:
        if isinstance(value, str):
            text = value.strip()
            if not text or text.lower() in {"none", "null"}:
                return None
            return text
        return value

    normalized = {key: _clean_value(value) for key, value in document.items()}
    summary_text = normalized.get("value")

    if isinstance(summary_text, str):
        # Graph search summaries append metadata (category, timestamps, etc.).
        meta: dict[str, str] = {}
        lower_text = summary_text.lower()
        marker = " for conversationfact"
        if marker in lower_text:
            idx = lower_text.index(marker)
            fact_text = summary_text[:idx].strip()
            if fact_text:
                meta["fact_text"] = fact_text
        patterns = {
            "category": r"\bcategory\s+([^\s,]+)",
            "updated_at": r"\bupdated_at\s+([^\s,]+)",
            "subject_type": r"\bsubject_type\s+([^\s,]+)",
            "subject_id": r"\bsubject_id\s+([^\s,]+)",
            "interaction_node": r"linked to interaction\s+([^\s,]+)",
        }
        for key, pattern in patterns.items():
            match = re.search(pattern, summary_text, flags=re.IGNORECASE)
            if match:
                meta[key] = match.group(1).strip()
        if meta.get("fact_text"):
            normalized["value"] = meta["fact_text"]
        for field in ("category", "updated_at", "subject_type", "subject_id", "interaction_node"):
            if meta.get(field) and not normalized.get(field):
                normalized[field] = meta[field]

    if normalized.get("updated_at") and not normalized.get("created_at"):
        normalized["created_at"] = normalized["updated_at"]

    return normalized


def _document_to_response(document: dict[str, Any]) -> ZepMemoryResponse:
    cleaned = _normalize_fact_document(document)
    timestamp = cleaned.get("updated_at") or cleaned.get("created_at")
    return ZepMemoryResponse(
        id=str(cleaned.get("id") or ""),
        name=cleaned.get("category") or cleaned.get("subject_type") or cleaned.get("role"),
        fact=cleaned.get("value") or "",
        created_at=timestamp,
        valid_at=None,
        invalid_at=None,
        expired_at=None,
    )


def _parse_iso_to_epoch(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


async def _fetch_user_fact_documents(
    memory_adapter,
    *,
    user_id: str,
    limit: int,
    search: str | None,
) -> list[dict[str, Any]]:
    search_fn = getattr(memory_adapter, "_search_documents", None)
    if not callable(search_fn):
        return []
    # When no search string is provided let Zep search by label so we don't bias toward manual facts.
    query = search or None
    try:
        docs = await search_fn(
            user_id=user_id,
            label=CONVERSATION_FACT_LABEL,
            query=query,
            limit=min(200, max(limit, 50)),
        )
    except ApiError as exc:
        if getattr(exc, "status_code", None) == 404:
            return []
        raise
    filtered: list[dict[str, Any]] = []
    seen: set[str] = set()
    hydrate_fact = getattr(memory_adapter, "get_fact_node", None)
    query_lower = (search or "").lower()
    for doc in docs or []:
        normalized = _normalize_fact_document(doc)
        if callable(hydrate_fact) and (
            not normalized.get("category") or not normalized.get("subject_type") or not normalized.get("updated_at")
        ):
            node_id = doc.get("id")
            if node_id:
                try:
                    hydrated = await hydrate_fact(node_uuid=str(node_id))
                except Exception as exc:
                    logger.debug("[Memory] Failed to hydrate fact node %s: %s", node_id, exc)
                    hydrated = None
                if hydrated:
                    merged = dict(hydrated)
                    merged.update(normalized)
                    normalized = _normalize_fact_document(merged)
        if query_lower and query_lower not in (normalized.get("value") or "").lower():
            continue
        dedupe_key = normalized.get("key") or normalized.get("id")
        if dedupe_key:
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
        filtered.append(normalized)
    return filtered
