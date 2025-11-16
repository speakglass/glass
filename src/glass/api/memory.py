"""Memory API routes - Zep Cloud Knowledge Graph integration."""
from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
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


class BulkDeleteResponse(BaseModel):
    deleted: int
    failed: list[str] = Field(default_factory=list)


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
        # Zep limit is max 50, so we fetch up to 50 and do client-side pagination
        zep_limit = min(50, limit + offset)
        
        base_edges = await memory_adapter.client.graph.edge.get_by_user_id(
            user_id=user.user_id,
            limit=zep_limit,
        )

        extra_edges: list = []
        if search:
            search_result = await memory_adapter.client.graph.search(
                user_id=user.user_id,
                query=search,
                scope="edges",
                limit=zep_limit,
            )
            extra_edges = _normalize_edges_payload(search_result)

        combined_edges: list = []
        seen_ids: set[str] = set()
        for edge in [*(extra_edges or []), *(base_edges or [])]:
            edge_id = getattr(edge, "uuid_", None)
            if not edge_id or edge_id in seen_ids:
                continue
            seen_ids.add(edge_id)
            combined_edges.append(edge)

        # Convert Zep edges to memory format - pass Zep fields as-is
        items: list[ZepMemoryResponse] = []
        for edge in combined_edges:
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
        # Zep doesn't support direct edge updates.
        # Strategy: Load the edge and create a new entry with updated value.
        try:
            current_edge = await memory_adapter.client.graph.edge.get(uuid_=memory_id)
        except Exception as fetch_error:
            logger.error(f"[Memory] Failed to load memory {memory_id}: {fetch_error}", exc_info=True)
            raise HTTPException(status_code=404, detail="Memory not found")

        # Defensive check – some Zep deployments return user_id in the edge payload.
        edge_user_id = getattr(current_edge, "user_id", None)
        if edge_user_id and edge_user_id != user.user_id:
            raise HTTPException(status_code=404, detail="Memory not found")
        
        if getattr(current_edge, "expired_at", None):
            raise HTTPException(status_code=400, detail="Expired memories cannot be edited")
        
        new_value = data.value if data.value else current_edge.fact
        
        fact_name = getattr(current_edge, "name", None)
        source_node_uuid = getattr(current_edge, "source_node_uuid", None)
        target_node_uuid = getattr(current_edge, "target_node_uuid", None)
        
        updated_edge = None
        if fact_name and source_node_uuid and target_node_uuid:
            try:
                add_result = await memory_adapter.client.graph.add_fact_triple(
                    user_id=user.user_id,
                    fact=new_value,
                    fact_name=fact_name,
                    fact_uuid=memory_id,
                    source_node_uuid=source_node_uuid,
                    target_node_uuid=target_node_uuid,
                )
                updated_edge = getattr(add_result, "edge", None)
            except Exception as triple_error:
                logger.warning(
                    f"[Memory] add_fact_triple failed for {memory_id}: {triple_error}; falling back to add()",
                    exc_info=True,
                )
        
        logger.info(f"[Memory] Updated memory {memory_id} for user {user.user_id}")
        
        from datetime import datetime, timezone
        response_edge = updated_edge or current_edge
        response_id = memory_id
        created_at = getattr(response_edge, "created_at", None)
        valid_at = getattr(response_edge, "valid_at", None)
        invalid_at = getattr(response_edge, "invalid_at", None)
        expired_at = getattr(response_edge, "expired_at", None)

        if updated_edge is None:
            # Fallback path: create a new entry and delete the previous one to avoid duplicates
            logger.debug("[Memory] Recreating memory %s due to missing fact triple metadata", memory_id)
            await _delete_graph_memory(memory_adapter, user.user_id, memory_id)
            episode = await memory_adapter.client.graph.add(
                user_id=user.user_id,
                type="text",
                data=new_value,
            )
            response_id = getattr(episode, "episode_id", memory_id)
            now_iso = datetime.now(timezone.utc).isoformat()
            created_at = created_at or now_iso
            valid_at = valid_at or now_iso
            invalid_at = None
            expired_at = None
            logger.info(
                "[Memory] Recreated memory %s as %s for user %s",
                memory_id,
                response_id,
                user.user_id,
            )

        memory_adapter.invalidate_user_cache(user.user_id)
        return ZepMemoryResponse(
            id=response_id,
            name=getattr(response_edge, 'name', None),
            fact=new_value,
            created_at=created_at or datetime.now(timezone.utc).isoformat(),
            valid_at=valid_at or datetime.now(timezone.utc).isoformat(),
            invalid_at=invalid_at,
            expired_at=expired_at,
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
    try:
        await memory_adapter.client.graph.edge.delete(uuid_=memory_id)
        logger.info(f"[Memory] Deleted graph edge {memory_id} for user {user_id}")
        return True
    except Exception as edge_error:
        logger.warning(f"[Memory] Edge delete failed for {memory_id}: {edge_error}; attempting episode delete")
        try:
            await memory_adapter.client.graph.delete_episode(
                user_id=user_id,
                episode_id=memory_id,
            )
            logger.info(f"[Memory] Deleted legacy episode {memory_id} for user {user_id}")
            return True
        except Exception as episode_error:
            logger.error(
                f"[Memory] Failed to delete memory {memory_id}: edge_error={edge_error}, episode_error={episode_error}",
                exc_info=True,
            )
            return False


def _normalize_edges_payload(search_result) -> list:
    payload = getattr(search_result, "edges", None)
    if isinstance(payload, (list, tuple)):
        return [edge for edge in payload if edge is not None]
    if isinstance(payload, dict):
        return [payload]
    return []
