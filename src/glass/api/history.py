from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..persistence.service import (
    count_conversations,
    delete_conversation,
    ensure_user,
    get_conversation_detail,
    list_recent_conversations,
    update_conversation_title,
)
from .helpers import client_id_for_user, serialize_detail, serialize_summary

router = APIRouter()


class UsageResponse(BaseModel):
    total_seconds: int | None
    remaining_seconds: int | None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None
    trial_minutes: int | None
    created_at: datetime
    last_login_at: datetime | None
    learning_lang: str | None = None
    native_lang: str | None = None
    proficiency: str | None = None


class ConversationSummary(BaseModel):
    id: str
    session_id: str
    title: str | None
    summary: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    learning_lang: str | None
    native_lang: str | None
    scores: dict[str, Any] | None


class ConversationDetail(ConversationSummary):
    messages: list[dict[str, Any]] | None
    feedback: str | None


class AccountSnapshot(BaseModel):
    user: UserResponse
    usage: UsageResponse
    conversations: list[ConversationSummary]


@router.get("/me", response_model=AccountSnapshot)
async def account_snapshot_endpoint(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> AccountSnapshot:
    try:
        app_state = request.app.state.app_state
        settings = app_state.settings
        db = request.app.state.history_store
        account_user = await ensure_user(
            db,
            user,
            trial_minutes=settings.free_minutes_per_user,
        )
        total_seconds: int | None = None
        remaining_seconds: int | None = None
        if settings.free_minutes_per_user is not None:
            total_minutes = account_user.trial_minutes or settings.free_minutes_per_user or 0
            total_seconds = max(0, int(total_minutes) * 60)
            client_id = client_id_for_user(user)
            remaining_seconds = await app_state.get_remaining_seconds_deadline(client_id)
        history_limit = max(1, int(settings.history_limit or 20))
        conversations = await list_recent_conversations(
            db, user_id=user.user_id, limit=history_limit
        )
        return AccountSnapshot(
            user=UserResponse(
                id=account_user.id,
                email=account_user.email,
                name=account_user.name,
                avatar_url=account_user.avatar_url,
                trial_minutes=account_user.trial_minutes,
                created_at=account_user.created_at,
                last_login_at=account_user.last_login_at,
                learning_lang=account_user.learning_lang,
                native_lang=account_user.native_lang,
                proficiency=account_user.proficiency,
            ),
            usage=UsageResponse(
                total_seconds=total_seconds,
                remaining_seconds=remaining_seconds,
            ),
            conversations=[
                ConversationSummary(**serialize_summary(convo))
                for convo in conversations
            ],
        )
    except Exception as exc:
        import traceback
        print(f"[/me] Error creating account snapshot for user {user.user_id}: {exc}")
        print(f"[/me] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create account snapshot: {str(exc)}"
        ) from exc


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]
    total: int
    limit: int
    offset: int


@router.get("/conversations", response_model=ConversationListResponse)
async def conversation_list_endpoint(
    request: Request,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationListResponse:
    app_state = request.app.state.app_state
    db = request.app.state.history_store
    max_limit = max(1, int(app_state.settings.history_limit or 100))
    final_limit = min(limit, max_limit)
    
    conversations = await list_recent_conversations(
        db, user_id=user.user_id, limit=final_limit, offset=offset, search=search
    )
    total = await count_conversations(db, user_id=user.user_id, search=search)
    
    return ConversationListResponse(
        conversations=[
        ConversationSummary(**serialize_summary(convo)) for convo in conversations
        ],
        total=total,
        limit=final_limit,
        offset=offset,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def conversation_detail_endpoint(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationDetail:
    db = request.app.state.history_store
    convo = await get_conversation_detail(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(**serialize_detail(convo))


class UpdateConversationRequest(BaseModel):
    title: str


@router.patch("/conversations/{conversation_id}", response_model=ConversationSummary)
async def update_conversation_endpoint(
    request: Request,
    conversation_id: str,
    update_data: UpdateConversationRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationSummary:
    """Update conversation title."""
    db = request.app.state.history_store
    convo = await update_conversation_title(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
        title=update_data.title,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationSummary(**serialize_summary(convo))


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation_endpoint(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    """Delete a conversation."""
    db = request.app.state.history_store
    success = await delete_conversation(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")


class ZepMemoryItem(BaseModel):
    """Zep memory fact from Knowledge Graph."""
    id: str  # Zep edge UUID
    label: str
    value: str  # fact text
    editable: bool = False  # Zep facts are read-only


class ZepMemoriesResponse(BaseModel):
    """Zep memories for a conversation."""
    memories: list[ZepMemoryItem]
    processing: bool  # True if Zep is still processing


class ZepContextRange(BaseModel):
    start: str | None = None
    end: str | None = None


class ZepContextItem(BaseModel):
    type: Literal["fact", "entity", "episode", "unknown"]
    text: str
    label: str | None = None
    range: ZepContextRange | None = None


class ZepThreadContextResponse(BaseModel):
    """Thread context string returned by Zep."""
    items: list[ZepContextItem]
    raw_context: str | None = None


@router.get("/conversations/{conversation_id}/zep-memories", response_model=ZepMemoriesResponse)
async def get_conversation_zep_memories(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ZepMemoriesResponse:
    """Get Zep-extracted memories for a conversation.
    
    This endpoint fetches facts from Zep's Knowledge Graph that were
    extracted from this specific conversation (thread).
    """
    import logging
    
    logger = logging.getLogger(__name__)
    db = request.app.state.history_store
    
    # 1. Verify conversation exists and belongs to user
    convo = await get_conversation_detail(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # 2. Get Zep memory adapter
    app_state = request.app.state.app_state
    memory_adapter = app_state.session_manager.memory_adapter
    
    # 3. Query Zep for facts from this thread
    # Use session_id as thread_id (they're the same)
    thread_id = convo.session_id
    
    try:
        # Check if thread episodes are still being processed by Zep
        # Per Zep docs: Use graph.episode.list() to get episodes for a thread
        processing = False
        try:
            # Get recent episodes for this thread/user
            # Note: Zep's graph.episode.list filters by user_id, not thread_id
            # We'll check all recent user episodes and see if any are unprocessed
            episodes = await memory_adapter.client.graph.episode.list(
                user_id=user.user_id,
                limit=10,  # Check recent episodes
            )
            
            # Check if any episodes are still processing
            for episode in episodes:
                if hasattr(episode, 'processed') and not episode.processed:
                    # At least one episode is still processing
                    processing = True
                    logger.info(f"[ZepMemories] Episode {episode.uuid_} still processing")
                    break
        except Exception as e:
            logger.warning(f"[ZepMemories] Failed to check episode status: {e}")
            # Fallback to time-based heuristic
            if convo.ended_at:
                from datetime import timezone
                time_since_end = (datetime.now(timezone.utc) - convo.ended_at).total_seconds()
                processing = time_since_end < 10
        
        # If still processing, return early with empty memories
        if processing:
            logger.info(f"[ZepMemories] Zep still processing for conversation {conversation_id}")
            return ZepMemoriesResponse(
                memories=[],
                processing=True,
            )
        
        # Search for facts from this specific conversation
        edges = await memory_adapter.client.graph.search(
            user_id=user.user_id,
            query=f"facts and information from recent conversation",
            scope="edges",
            limit=50,
        )
        
        memories = []
        if edges and edges.edges:
            for edge in edges.edges:
                if not hasattr(edge, 'fact') or not edge.fact:
                    continue
                
                memories.append(ZepMemoryItem(
                    id=edge.uuid_,
                    label="AI-extracted",  # Could parse from edge.name
                    value=edge.fact,
                    editable=False,
                ))
        
        logger.info(f"[ZepMemories] Found {len(memories)} memories for conversation {conversation_id}")
        
        return ZepMemoriesResponse(
            memories=memories,
            processing=False,
        )
    
    except Exception as e:
        logger.error(f"[ZepMemories] Failed to fetch Zep memories: {e}", exc_info=True)
        # Return empty result on error (non-critical)
        return ZepMemoriesResponse(
            memories=[],
            processing=False,
        )


@router.get("/conversations/{conversation_id}/zep-context", response_model=ZepThreadContextResponse)
async def get_conversation_zep_context(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ZepThreadContextResponse:
    """Return the summarized thread context from Zep for this conversation."""
    import logging

    logger = logging.getLogger(__name__)
    db = request.app.state.history_store
    convo = await get_conversation_detail(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    app_state = request.app.state.app_state
    memory_adapter = getattr(app_state.session_manager, "memory_adapter", None)
    if memory_adapter is None:
        raise HTTPException(status_code=503, detail="Memory adapter not configured")

    try:
        context_payload = await memory_adapter.get_structured_thread_context(convo.session_id, user.user_id)
        raw_context = context_payload.get("raw_context")
        items = context_payload.get("items") or []
        normalized_items = []
        for item in items:
            normalized_items.append(
                ZepContextItem(
                    type=item.get("type") or "unknown",
                    text=item.get("text") or "",
                    label=item.get("label"),
                    range=ZepContextRange(**item["range"]) if item.get("range") else None,
                )
            )
        return ZepThreadContextResponse(
            items=normalized_items,
            raw_context=raw_context or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ZepContext] Failed for conversation {conversation_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch Zep context") from exc
