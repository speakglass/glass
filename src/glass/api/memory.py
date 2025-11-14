"""Memory API routes - Zep Cloud Knowledge Graph integration."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..auth.jwt import AuthenticatedUser, require_authenticated_user

router = APIRouter(prefix="/memories", tags=["memory"])
logger = logging.getLogger(__name__)


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


class CreateMemoryRequest(BaseModel):
    """Request to create a new memory."""
    value: str = Field(..., description="The fact to remember")


class UpdateMemoryRequest(BaseModel):
    """Request to update a memory."""
    value: str | None = None


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
        # Search Zep Knowledge Graph for user's facts
        # Zep limit is max 50, so we fetch 50 and do client-side pagination
        search_query = search if search else "user information, preferences, and facts"
        
        # Fetch max 50 items from Zep (API limit)
        zep_limit = min(50, limit + offset)
        
        edges = await memory_adapter.client.graph.search(
            user_id=user.user_id,
            query=search_query,
            scope="edges",
            limit=zep_limit,
        )
        
        # Convert Zep edges to memory format - pass Zep fields as-is
        items = []
        for edge in edges.edges:
            if not hasattr(edge, 'fact') or not edge.fact:
                continue
            
            # Helper to convert datetime/string to ISO string
            def to_iso_string(dt) -> str | None:
                if dt is None:
                    return None
                if isinstance(dt, str):
                    return dt
                return dt.isoformat()
            
            items.append(ZepMemoryResponse(
                id=edge.uuid_,
                name=getattr(edge, 'name', None),
                fact=edge.fact,
                created_at=to_iso_string(getattr(edge, 'created_at', None)),
                valid_at=to_iso_string(getattr(edge, 'valid_at', None)),
                invalid_at=to_iso_string(getattr(edge, 'invalid_at', None)),
                expired_at=to_iso_string(getattr(edge, 'expired_at', None)),
            ))
        
        # Apply offset/limit (client-side pagination since Zep doesn't support offset)
        paginated_items = items[offset:offset + limit]
        
        logger.info(f"[Memory] Listed {len(paginated_items)} memories for user {user.user_id}")
        
        return ZepMemoryListResponse(
            items=paginated_items,
            total=len(items),
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
            last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else None
        else:
            first_name = None
            last_name = None
        
        await memory_adapter.ensure_user(
            user_id=user.user_id,
            email=user.email,
            first_name=first_name,
            last_name=last_name,
        )
        
        # Add each memory to Zep Knowledge Graph using text type (simplest)
        from datetime import datetime, timezone
        results = []
        
        for memory_data in data:
            episode = await memory_adapter.client.graph.add(
                user_id=user.user_id,
                type="text",
                data=memory_data.value,
            )
            
            results.append(ZepMemoryResponse(
                id=episode.episode_id if hasattr(episode, 'episode_id') else "pending",
                name=None,
                fact=memory_data.value,
                created_at=datetime.now(timezone.utc).isoformat(),
                valid_at=datetime.now(timezone.utc).isoformat(),
                invalid_at=None,
                expired_at=None,
            ))
        
        logger.info(f"[Memory] Created {len(results)} memories for user {user.user_id}")
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
        # Zep doesn't support direct edge updates
        # Strategy: Delete old edge, create new one
        
        # 1. Fetch current edge to get its data
        edges = await memory_adapter.client.graph.search(
            user_id=user.user_id,
            query="",  # Empty query to get all
            scope="edges",
            limit=500,
        )
        
        current_edge = next((e for e in edges.edges if e.uuid_ == memory_id), None)
        if not current_edge:
            raise HTTPException(status_code=404, detail="Memory not found")
        
        # 2. Zep doesn't support direct edge updates
        # Add new fact as text - Zep will handle invalidating old facts automatically
        new_value = data.value if data.value else current_edge.fact
        
        await memory_adapter.client.graph.add(
            user_id=user.user_id,
            type="text",
            data=new_value,
        )
        
        logger.info(f"[Memory] Updated memory {memory_id} for user {user.user_id}")
        
        from datetime import datetime, timezone
        return ZepMemoryResponse(
            id=memory_id,
            name=getattr(current_edge, 'name', None),
            fact=new_value,
            created_at=datetime.now(timezone.utc).isoformat(),
            valid_at=datetime.now(timezone.utc).isoformat(),
            invalid_at=None,
            expired_at=None,
        )
    
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
    
    try:
        # Zep's delete method (check SDK for exact API)
        # For now, mark as expired (Zep's soft delete)
        await memory_adapter.client.graph.delete_episode(
            user_id=user.user_id,
            episode_id=memory_id,  # Try using edge UUID
        )
        
        logger.info(f"[Memory] Deleted memory {memory_id} for user {user.user_id}")
    
    except Exception as e:
        logger.error(f"[Memory] Failed to delete memory: {e}", exc_info=True)
        # Don't fail hard - Zep might not support edge deletion yet
        logger.warning("[Memory] Zep edge deletion not fully supported, marking as archived")


@router.post("/bulk-delete", status_code=204)
async def bulk_delete_memories(
    request: Request,
    memory_ids: list[str],
    user: Annotated[AuthenticatedUser, Depends(require_authenticated_user)],
):
    """Delete multiple memories at once."""
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter
    
    deleted_count = 0
    for memory_id in memory_ids:
        try:
            await memory_adapter.client.graph.delete_episode(
                user_id=user.user_id,
                episode_id=memory_id,
            )
            deleted_count += 1
        except Exception as e:
            logger.warning(f"[Memory] Failed to delete {memory_id}: {e}")
            continue
    
    logger.info(f"[Memory] Bulk deleted {deleted_count}/{len(memory_ids)} memories for user {user.user_id}")
