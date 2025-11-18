from __future__ import annotations


import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..adapters.memory.schema import build_conversation_fact_payload, build_interaction_payload
from ..domain.memory import ConversationInsights
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
from .helpers import (
    client_id_for_user,
    serialize_detail,
    serialize_summary,
    extract_conversation_memories_with_llm,
)

router = APIRouter()
LOGGER = logging.getLogger(__name__)


async def _partners_for_conversations(
    db,
    user_id: str,
    conversations: list,
):
    partner_ids = [convo.partner_id for convo in conversations if convo.partner_id]
    return await get_partners_by_ids(db, user_id=user_id, partner_ids=partner_ids)



def _normalize_partner_id(partner_id: str | None) -> str | None:
    if partner_id is None:
        return None
    if not isinstance(partner_id, str):
        return None
    normalized = partner_id.strip().lower()
    return normalized or None


def _extract_partner_identifier(snapshot: dict[str, Any] | None, fallback_partner_id: str | None) -> str | None:
    if isinstance(snapshot, dict):
        partner_entry = snapshot.get("partner")
        if isinstance(partner_entry, dict):
            partner_id = partner_entry.get("id")
            normalized = _normalize_partner_id(partner_id)
            if normalized:
                return normalized
    return _normalize_partner_id(fallback_partner_id)


def _memory_thread_id(conversation, user_id: str) -> str:
    """Reconstruct the memory thread identifier used when the session ran."""
    session_id = getattr(conversation, "session_id", None)
    session_str = str(session_id or "").strip()
    if not session_str:
        raise ValueError("Conversation is missing session_id")

    snapshot = getattr(conversation, "participant_snapshot", None)
    partner_identifier = _extract_partner_identifier(snapshot, getattr(conversation, "partner_id", None))
    if not partner_identifier:
        partner_identifier = f"partner:{session_str}".lower()

    return f"user:{user_id}:partner:{partner_identifier}:session:{session_str}"


def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split()
    if not parts:
        return None, None
    first = parts[0]
    last = " ".join(parts[1:]) if len(parts) > 1 else None
    return first, last


async def _ensure_graph_user(memory_adapter, user: AuthenticatedUser) -> None:
    try:
        first_name, last_name = _split_name(user.name)
        await memory_adapter.ensure_user(
            user_id=user.user_id,
            email=user.email,
            first_name=first_name,
            last_name=last_name,
        )
    except Exception as exc:
        LOGGER.warning("[Conversations] Failed to ensure user in graph: %s", exc)


async def _add_memory_document(
    memory_adapter,
    user_id: str,
    *,
    payload,
    thread_id: str | None,
) -> str | None:
    add_doc = getattr(memory_adapter, "add_graph_document", None)
    if not callable(add_doc):
        return None
    try:
        return await add_doc(user_id=user_id, payload=payload, thread_id=thread_id)
    except Exception as exc:
        LOGGER.warning("[Conversations] Failed to add document for %s: %s", user_id, exc)
        return None


async def _persist_insights_as_documents(
    memory_adapter,
    user: AuthenticatedUser,
    convo: Any,
    insights: dict[str, Any],
    *,
    thread_id: str | None,
) -> None:
    if not insights:
        return
    await _ensure_graph_user(memory_adapter, user)
    user_id = user.user_id
    thread_lower = thread_id.strip().lower() if isinstance(thread_id, str) else None
    interaction_key = f"interaction:{thread_lower}" if thread_lower else None

    payloads: list[Any] = []
    now = datetime.now(timezone.utc)

    for text in insights.get("user_insights") or []:
        fact = (text or "").strip()
        if not fact:
            continue
        payload = build_conversation_fact_payload(
            value=fact,
            subject_type="user",
            subject_id=user_id,
            category="user_conversation",
            updated_at=now,
            interaction_thread_id=thread_id,
            interaction_key=interaction_key,
        )
        if payload.entities or payload.edges:
            payloads.append(payload)

    partner_identifier = _normalize_partner_id(getattr(convo, "partner_id", None))
    if partner_identifier:
        for text in insights.get("partner_insights") or []:
            fact = (text or "").strip()
            if not fact:
                continue
            payload = build_conversation_fact_payload(
                value=fact,
                subject_type="partner",
                subject_id=partner_identifier,
                category="partner_conversation",
                updated_at=now,
                interaction_thread_id=thread_id,
                interaction_key=interaction_key,
            )
            if payload.entities or payload.edges:
                payloads.append(payload)

    interaction_entries = [
        entry.strip()
        for entry in (insights.get("interaction_insights") or [])
        if isinstance(entry, str) and entry.strip()
    ]
    if thread_id and interaction_entries:
        interaction_payload = build_interaction_payload(
            user_id=user_id,
            thread_id=thread_id,
            language_code=getattr(convo, "learning_lang", None),
            summary=interaction_entries[0],
            topics=[entry for entry in interaction_entries[1:]],
            partner_id=partner_identifier,
        )
        if interaction_payload.entities or interaction_payload.edges:
            payloads.append(interaction_payload)

    for payload in payloads:
        await _add_memory_document(
            memory_adapter,
            user_id,
            payload=payload,
            thread_id=thread_id,
        )

    try:
        memory_adapter.invalidate_user_cache(user_id)
    except Exception as exc:
        LOGGER.debug("[Conversations] Unable to invalidate user cache: %s", exc)


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
    language_level: str | None = None
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
    memory_thread_id: str | None = None
    memory_insights: ConversationInsights | None = None


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
                language_level=account_user.language_level,
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
    try:
        memory_thread_id = _memory_thread_id(convo, user.user_id)
    except ValueError:
        memory_thread_id = None
    return ConversationDetail(
        **serialize_detail(
            convo,
            partner=partner,
            memory_thread_id=memory_thread_id,
            memory_insights=convo.memory_insights,
        )
    )


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    memory_insights: ConversationInsights | None = None


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
        memory_insights=update_data.memory_insights,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    partner = None
    if convo.partner_id:
        partner = (await get_partners_by_ids(db, user_id=user.user_id, partner_ids=[convo.partner_id])).get(
            convo.partner_id
        )

    insights_to_persist = update_data.memory_insights
    session_manager = request.app.state.app_state.session_manager
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    if memory_adapter and insights_to_persist:
        try:
            thread_id = _memory_thread_id(convo, user.user_id)
        except ValueError as exc:
            LOGGER.debug("[Conversations] Missing thread id for insights persistence: %s", exc)
        else:
            try:
                await memory_adapter.ensure_thread(thread_id, user.user_id)
                await memory_adapter.persist_conversation_insights(
                    user_id=user.user_id,
                    thread_id=thread_id,
                    insights=insights_to_persist,
                    partner_id=convo.partner_id,
                    language_code=convo.learning_lang,
                    started_at=convo.started_at.timestamp() if convo.started_at else None,
                    ended_at=convo.ended_at.timestamp() if convo.ended_at else None,
                )
                await _persist_insights_as_documents(
                    memory_adapter,
                    user,
                    convo,
                    insights_to_persist,
                    thread_id=thread_id,
                )
            except Exception as exc:
                LOGGER.warning(
                    "[Conversations] Failed to persist updated insights for %s: %s",
                    thread_id,
                    exc,
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

    session_manager = request.app.state.app_state.session_manager
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    llm_adapter = getattr(session_manager, "llm_adapter", None)
    if memory_adapter and llm_adapter and convo.messages:
        new_thread_id = f"user:{user.user_id}:partner:{partner.id}"
        started_epoch = convo.started_at.timestamp() if convo.started_at else None
        ended_epoch = convo.ended_at.timestamp() if convo.ended_at else None
        try:
            insights = await extract_conversation_memories_with_llm(
                llm_adapter,
                convo.messages,
                convo.learning_lang,
                convo.native_lang,
                partner.name,
            )
        except Exception as exc:
            insights = None
            LOGGER.debug("[Conversations] Memory extraction skipped for reassignment: %s", exc)

        if insights:
            try:
                await memory_adapter.ensure_thread(new_thread_id, user.user_id)
                await memory_adapter.persist_conversation_insights(
                    user_id=user.user_id,
                    thread_id=new_thread_id,
                    insights=insights,
                    partner_id=partner.id,
                    language_code=convo.learning_lang,
                    started_at=started_epoch,
                    ended_at=ended_epoch,
                )
            except Exception as exc:
                LOGGER.warning(
                    "[Conversations] Failed to persist reassigned memories thread=%s: %s",
                    new_thread_id,
                    exc,
                )

    return ConversationSummary(**serialize_summary(convo, partner=partner))


@router.delete("/conversations/{conversation_id}", status_code=200)
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


class ConversationMemoryItem(BaseModel):
    """Memory fact extracted from the conversation."""
    id: str  # Edge UUID
    label: str
    value: str  # fact text
    editable: bool = False  # Facts returned here are read-only


class ConversationMemoriesResponse(BaseModel):
    """Memories associated with a conversation."""
    memories: list[ConversationMemoryItem]
    processing: bool  # True if extraction is still running


class ConversationContextRange(BaseModel):
    start: str | None = None
    end: str | None = None


class ConversationContextItem(BaseModel):
    type: Literal["fact", "entity", "episode", "unknown"]
    text: str
    label: str | None = None
    range: ConversationContextRange | None = None


class ConversationThreadContextResponse(BaseModel):
    """Thread context string returned by the memory backend."""
    items: list[ConversationContextItem]
    raw_context: str | None = None


@router.get("/conversations/{conversation_id}/memories", response_model=ConversationMemoriesResponse)
async def get_conversation_memories(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
    thread_id: str | None = Query(default=None, description="Optional override for the memory thread identifier"),
) -> ConversationMemoriesResponse:
    """Get extracted memories for a conversation.
    
    This endpoint fetches facts from the memory backend's knowledge graph
    that were extracted from this specific conversation (thread).
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
    
    # 2. Get memory adapter
    app_state = request.app.state.app_state
    session_manager = getattr(app_state, "session_manager", None)
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    if memory_adapter is None:
        logger.warning("[ConversationMemories] Memory adapter missing")
        raise HTTPException(status_code=503, detail="Memory adapter unavailable")

    if thread_id:
        effective_thread_id = thread_id
    else:
        try:
            effective_thread_id = _memory_thread_id(convo, user.user_id)
        except ValueError as exc:
            logger.error("[ConversationMemories] Failed to derive thread id: %s", exc)
            raise HTTPException(status_code=500, detail="Conversation metadata incomplete") from exc

    # 3. Ask the adapter for facts tied to this thread
    try:
        status_task = asyncio.create_task(
            memory_adapter._refresh_pending_episodes(user_id=user.user_id, thread_id=effective_thread_id)
        )
        raw_memories, processing = await memory_adapter.list_conversation_memories(
            user_id=user.user_id,
            thread_id=effective_thread_id,
            conversation_end=convo.ended_at,
        )

        memories = []
        for item in raw_memories:
            item_id = item.get("id")
            value = item.get("value")
            if not item_id or not value:
                continue
            role = (item.get("role") or "").lower()
            label = "Partner Fact" if role == "partner" else "User Fact"
            memories.append(
                ConversationMemoryItem(
                    id=item_id,
                    label=label,
                    value=value,
                    editable=False,
                )
            )

        pending_flag = session_manager.is_memory_pending(effective_thread_id) if session_manager else False
        try:
            episode_processing = await status_task
        except Exception as status_exc:
            LOGGER.debug("[ConversationMemories] Episode status poll failed: %s", status_exc)
            episode_processing = False
        combined_processing = processing or pending_flag or episode_processing
        logger.info(
            "[ConversationMemories] thread=%s user=%s memories=%d processing=%s",
            effective_thread_id,
            user.user_id,
            len(memories),
            combined_processing,
        )

        return ConversationMemoriesResponse(
            memories=memories,
            processing=combined_processing,
        )
    
    except Exception as e:
        if 'status_task' in locals() and not status_task.done():
            try:
                await status_task
            except Exception:
                pass
        logger.error(f"[ConversationMemories] Failed to fetch memories: {e}", exc_info=True)
        # Return empty result on error (non-critical)
        return ConversationMemoriesResponse(
            memories=[],
            processing=False,
        )


@router.get("/conversations/{conversation_id}/context", response_model=ConversationThreadContextResponse)
async def get_conversation_context(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationThreadContextResponse:
    """Return the summarized thread context for this conversation."""
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
                ConversationContextItem(
                    type=item.get("type") or "unknown",
                    text=item.get("text") or "",
                    label=item.get("label"),
                    range=ConversationContextRange(**item["range"]) if item.get("range") else None,
                )
            )
        return ConversationThreadContextResponse(
            items=normalized_items,
            raw_context=raw_context or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ConversationContext] Failed for conversation {conversation_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch conversation context") from exc
