"""Memory API routes backed by the relational memory layer."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from ..auth.jwt import AuthenticatedUser, require_authenticated_user

router = APIRouter(prefix="/memories", tags=["memory"])
logger = logging.getLogger(__name__)


class MemoryRecordResponse(BaseModel):
    id: str
    text: str
    scope: str
    category: str
    retention: str
    importance: int
    partner_id: str | None = None
    conversation_id: str | None = None
    summary: str | None = None
    retention_expires_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class MemoryRecordListResponse(BaseModel):
    items: list[MemoryRecordResponse]
    total: int
    limit: int
    offset: int


class BulkDeleteResponse(BaseModel):
    deleted: int
    failed: list[str] = Field(default_factory=list)


class CreateMemoryRequest(BaseModel):
    value: str = Field(..., description="The fact to remember")


class UpdateMemoryRequest(BaseModel):
    value: str = Field(..., description="Updated fact content")


@router.get("", response_model=MemoryRecordListResponse)
async def list_user_memories(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
) -> MemoryRecordListResponse:
    """List a user's memories with pagination and optional text search."""
    memory_adapter = request.app.state.app_state.session_manager.memory_adapter
    try:
        items, total = await memory_adapter.list_user_memories(
            user_id=user.user_id,
            limit=limit,
            offset=offset,
            search=search,
        )
        return MemoryRecordListResponse(
            items=[MemoryRecordResponse(**item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        logger.error("[Memory] Failed to list entries: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list memories") from exc


@router.post("", response_model=list[MemoryRecordResponse], status_code=201)
async def create_user_memory(
    request: Request,
    data: list[CreateMemoryRequest],
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> list[MemoryRecordResponse]:
    """Create new durable memories."""
    memory_adapter = request.app.state.app_state.session_manager.memory_adapter
    created: list[MemoryRecordResponse] = []
    for payload in data:
        normalized = (payload.value or "").strip()
        if not normalized:
            continue
        try:
            record = await memory_adapter.create_memory_record(
                user_id=user.user_id,
                value=normalized,
                conversation_id=None,
            )
            created.append(MemoryRecordResponse(**record))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.error("[Memory] Failed to store manual memory: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to create memory") from exc
    if not created:
        raise HTTPException(status_code=400, detail="No valid memories provided")
    return created


@router.patch("/{memory_id}", response_model=MemoryRecordResponse)
async def update_user_memory(
    request: Request,
    memory_id: str,
    data: UpdateMemoryRequest,
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> MemoryRecordResponse:
    """Update an existing memory."""
    memory_adapter = request.app.state.app_state.session_manager.memory_adapter
    normalized = (data.value or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Updated value cannot be empty")
    try:
        record = await memory_adapter.update_memory_record(
            user_id=user.user_id,
            record_id=memory_id,
            value=normalized,
        )
        return MemoryRecordResponse(**record)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[Memory] Failed to update record %s: %s", memory_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update memory") from exc


@router.delete("/{memory_id}", status_code=204, response_class=Response)
async def delete_user_memory(
    request: Request,
    memory_id: str,
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> Response:
    """Delete a memory."""
    memory_adapter = request.app.state.app_state.session_manager.memory_adapter
    deleted = await memory_adapter.delete_memory_record(user_id=user.user_id, record_id=memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    return Response(status_code=204)


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_memories(
    request: Request,
    memory_ids: Annotated[list[str], Body(embed=True)],
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
) -> BulkDeleteResponse:
    """Delete multiple memories at once."""
    memory_adapter = request.app.state.app_state.session_manager.memory_adapter

    deleted = 0
    failed: list[str] = []
    for memory_id in memory_ids:
        try:
            success = await memory_adapter.delete_memory_record(user_id=user.user_id, record_id=memory_id)
        except Exception as exc:
            logger.error("[Memory] Failed to delete %s: %s", memory_id, exc, exc_info=True)
            success = False
        if success:
            deleted += 1
        else:
            failed.append(memory_id)
    return BulkDeleteResponse(deleted=deleted, failed=failed)
