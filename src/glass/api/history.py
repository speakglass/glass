from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..persistence.service import (
    count_conversations,
    delete_conversation,
    ensure_user,
    get_conversation_detail,
    get_partners_by_ids,
    list_recent_conversations,
    reassign_conversation_partner,
    update_conversation_title,
)
from .helpers import client_id_for_user, serialize_detail, serialize_summary

router = APIRouter()
LOGGER = logging.getLogger(__name__)


async def _partners_for_conversations(
    db,
    user_id: str,
    conversations: list,
):
    partner_ids = [convo.partner_id for convo in conversations if convo.partner_id]
    return await get_partners_by_ids(db, user_id=user_id, partner_ids=partner_ids)


def _build_participants(snapshot: dict[str, Any] | None, user: AuthenticatedUser | None) -> dict[str, dict[str, Any]]:
    participants: dict[str, dict[str, Any]] = {
        "glass": {"id": "glass", "name": "Glass"},
    }
    user_entry = (snapshot or {}).get("user") or {}
    user_id = user_entry.get("id") or (user.user_id if user else None)
    participants["user"] = {
        "id": (str(user_id).lower() if isinstance(user_id, str) else user_id),
        "name": user_entry.get("name") or (user.name if user and user.name else "You"),
    }
    partner_entry = (snapshot or {}).get("partner")
    if partner_entry:
        partner_id = str(partner_entry.get("id") or "").lower()
        partner_profile = {
            "id": partner_id or None,
            "name": partner_entry.get("name") or "Partner",
        }
        if partner_id:
            participants[partner_id] = partner_profile
        participants.setdefault("partner", partner_profile)
    else:
        participants.setdefault("partner", {"name": "Partner"})
    return participants


class UsageResponse(BaseModel):
    # Daily quota (resets at UTC midnight)
    daily_total_seconds: int | None  # None if unlimited
    daily_remaining_seconds: int | None  # None if unlimited
    # Bonus quota (persists across days, used after daily is exhausted)
    bonus_total_seconds: int | None
    bonus_remaining_seconds: int | None
    # Combined remaining (for backward compatibility and simple display)
    total_remaining_seconds: int | None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None
    bonus_minutes: int | None  # Extra minutes that can be used after daily quota
    created_at: datetime
    last_login_at: datetime | None
    learning_lang: str | None = None
    native_lang: str | None = None
    proficiency: str | None = None
    email_verified: bool = False


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
    partner_id: str | None = None
    participant_snapshot: dict[str, Any] | None = None


class ConversationDetail(ConversationSummary):
    messages: list[dict[str, Any]] | None
    feedback: str | None


class AccountSnapshot(BaseModel):
    user: UserResponse
    usage: UsageResponse


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
            bonus_minutes=None,  # Don't override existing bonus_minutes
        )
        
        client_id = client_id_for_user(user)
        
        # Calculate usage based on new system
        daily_total_seconds: int | None = None
        daily_remaining_seconds: int | None = None
        bonus_total_seconds: int | None = None
        bonus_remaining_seconds: int | None = None
        total_remaining_seconds: int | None = None
        
        if settings.daily_free_minutes is None:
            # Unlimited usage
            daily_total_seconds = None
            daily_remaining_seconds = None
            total_remaining_seconds = None
        else:
            # Daily quota enabled
            daily_total_seconds = max(0, int(settings.daily_free_minutes) * 60)
            used_today = await app_state.get_used_seconds_today(client_id)
            daily_remaining_seconds = max(0, daily_total_seconds - used_today)
            
            # Calculate bonus
            if account_user.bonus_minutes:
                bonus_total_seconds = max(0, int(account_user.bonus_minutes) * 60)
                # How much over daily quota?
                over_daily = max(0, used_today - daily_total_seconds)
                bonus_remaining_seconds = max(0, bonus_total_seconds - over_daily)
            else:
                bonus_total_seconds = None
                bonus_remaining_seconds = None
            
            # Combined remaining
            total_remaining_seconds = daily_remaining_seconds
            if daily_remaining_seconds == 0 and bonus_remaining_seconds:
                total_remaining_seconds = bonus_remaining_seconds
        
        return AccountSnapshot(
            user=UserResponse(
                id=account_user.id,
                email=account_user.email,
                name=account_user.name,
                avatar_url=account_user.avatar_url,
                bonus_minutes=account_user.bonus_minutes,
                created_at=account_user.created_at,
                last_login_at=account_user.last_login_at,
                learning_lang=account_user.learning_lang,
                native_lang=account_user.native_lang,
                proficiency=account_user.proficiency,
                email_verified=account_user.email_verified,
            ),
            usage=UsageResponse(
                daily_total_seconds=daily_total_seconds,
                daily_remaining_seconds=daily_remaining_seconds,
                bonus_total_seconds=bonus_total_seconds,
                bonus_remaining_seconds=bonus_remaining_seconds,
                total_remaining_seconds=total_remaining_seconds,
            ),
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
    """List conversations with pagination support.
    
    Args:
        limit: Number of conversations to return per page (default: 20, max: 100)
        offset: Number of conversations to skip for pagination
        search: Optional search query to filter conversations
    """
    db = request.app.state.history_store
    
    # Apply reasonable limits for pagination
    max_limit = 100
    final_limit = max(1, min(limit, max_limit))
    final_offset = max(0, offset)
    
    conversations = await list_recent_conversations(
        db, user_id=user.user_id, limit=final_limit, offset=final_offset, search=search
    )
    total = await count_conversations(db, user_id=user.user_id, search=search)
    partner_map = await _partners_for_conversations(db, user.user_id, conversations)
    
    return ConversationListResponse(
        conversations=[
            ConversationSummary(
                **serialize_summary(convo, partner=partner_map.get(convo.partner_id or ""))
            )
            for convo in conversations
        ],
        total=total,
        limit=final_limit,
        offset=final_offset,
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
    partner = None
    if convo.partner_id:
        partner = (await get_partners_by_ids(db, user_id=user.user_id, partner_ids=[convo.partner_id])).get(
            convo.partner_id
        )
    return ConversationDetail(**serialize_detail(convo, partner=partner))


class UpdateConversationRequest(BaseModel):
    title: str


class UpdateConversationPartnerRequest(BaseModel):
    partner_id: str


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
    partner = None
    if convo.partner_id:
        partner = (await get_partners_by_ids(db, user_id=user.user_id, partner_ids=[convo.partner_id])).get(
            convo.partner_id
        )
    return ConversationSummary(**serialize_summary(convo, partner=partner))


@router.patch("/conversations/{conversation_id}/partner", response_model=ConversationSummary)
async def update_conversation_partner_endpoint(
    request: Request,
    conversation_id: str,
    payload: UpdateConversationPartnerRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationSummary:
    db = request.app.state.history_store
    try:
        convo, partner, _ = await reassign_conversation_partner(
            db,
            user_id=user.user_id,
            conversation_id=conversation_id,
            partner_id=payload.partner_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if convo is None or partner is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    memory_adapter = getattr(request.app.state.app_state.session_manager, "memory_adapter", None)
    if memory_adapter and convo.messages:
        new_thread_id = f"user:{user.user_id}:partner:{partner.id}"
        participants = _build_participants(convo.participant_snapshot, user)
        started_epoch = convo.started_at.timestamp() if convo.started_at else None
        try:
            await memory_adapter.ensure_thread(new_thread_id, user.user_id)
            await memory_adapter.add_conversation_messages(
                thread_id=new_thread_id,
                user_id=user.user_id,
                messages=convo.messages,
                session_start_time=started_epoch,
                participants=participants,
            )
        except Exception as exc:
            LOGGER.warning(
                "[Conversations] Failed to sync reassigned partner thread %s: %s",
                new_thread_id,
                exc,
            )

    return ConversationSummary(**serialize_summary(convo, partner=partner))


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
    
    def _edge_matches_thread(edge, target_thread_id: str) -> bool:
        candidates = [
            getattr(edge, "thread_id", None),
            getattr(edge, "thread_uuid", None),
            getattr(edge, "thread", None),
        ]
        metadata = getattr(edge, "metadata", None)
        if isinstance(metadata, dict):
            candidates.append(metadata.get("thread_id"))
            candidates.append(metadata.get("thread"))
        target = (target_thread_id or "").lower()
        for candidate in candidates:
            if candidate and str(candidate).lower() == target:
                return True
        # If Zep does not return thread metadata, keep the edge only when candidate info is missing.
        return not any(candidates)

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
                episode_thread = getattr(episode, "thread_id", None) or getattr(episode, "thread_uuid", None)
                if episode_thread and episode_thread != thread_id:
                    continue
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
            query="facts and information from recent conversation",
            scope="edges",
            limit=50,
        )
        
        memories = []
        if edges and edges.edges:
            for edge in edges.edges:
                if not hasattr(edge, 'fact') or not edge.fact:
                    continue
                
                if not _edge_matches_thread(edge, thread_id):
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
