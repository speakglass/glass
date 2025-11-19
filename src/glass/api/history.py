from __future__ import annotations


import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
from ..services.limits import conversation_limit_status, ConversationLimitStatus
from .helpers import (
    serialize_detail,
    serialize_summary,
    build_memory_entries_with_llm,
)
from .memory import MemoryRecordResponse

router = APIRouter()
LOGGER = logging.getLogger(__name__)


async def _partners_for_conversations(
    db,
    user_id: str,
    conversations: list,
):
    partner_ids = [convo.partner_id for convo in conversations if convo.partner_id]
    return await get_partners_by_ids(db, user_id=user_id, partner_ids=partner_ids)


def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split()
    if not parts:
        return None, None
    first = parts[0]
    last = " ".join(parts[1:]) if len(parts) > 1 else None
    return first, last


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    avatar_url: str | None
    created_at: datetime
    last_login_at: datetime | None
    learning_lang: str | None = None
    native_lang: str | None = None
    language_level: str | None = None
    email_verified: bool = False
    subscription_status: str | None = None
    subscription_plan: str | None = None
    subscription_interval: str | None = None
    subscription_current_period_end: datetime | None = None
    subscription_cancel_at: datetime | None = None
    subscription_cancel_at_period_end: bool | None = None
    billing_exempt: bool = False


class BillingStatusResponse(BaseModel):
    enabled: bool
    active: bool
    self_hosted: bool
    billing_exempt: bool
    status: str | None = None
    plan: str | None = None
    plan_interval: str | None = None
    current_period_end: datetime | None = None
    cancel_at: datetime | None = None
    cancel_at_period_end: bool | None = None


class PartnerInfo(BaseModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    voice_id: str | None = None
    learning_lang: str | None = None
    native_lang: str | None = None
    is_system: bool | None = None
    kind: Literal["roleplay", "live_call"] | None = None


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
    partner: PartnerInfo | None = None


class ConversationDetail(ConversationSummary):
    messages: list[dict[str, Any]] | None
    feedback: str | None
    memories: list[MemoryRecordResponse] = []
    feedback_items: list[dict[str, Any]] | None = None


class ConversationLimitResponse(BaseModel):
    enabled: bool
    limit: int | None = None
    used: int = 0
    remaining: int | None = None
    blocked: bool = False


class AccountLimitsResponse(BaseModel):
    conversations: ConversationLimitResponse | None = None


class AccountSnapshot(BaseModel):
    user: UserResponse
    billing: BillingStatusResponse
    limits: AccountLimitsResponse | None = None


class ConversationCreateResponse(BaseModel):
    conversation_id: str


@router.post("/conversations/new", response_model=ConversationCreateResponse)
async def create_conversation_identifier(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationCreateResponse:
    """Generate a new conversation identifier owned by the authenticated user."""
    db = request.app.state.history_store
    account_user = await ensure_user(db, user)
    app_state = request.app.state.app_state
    billing_service = app_state.billing_service
    billing_payload = billing_service.user_status_payload(account_user)
    settings = app_state.settings
    total_conversations = await count_conversations(db, user_id=account_user.id)
    quota: ConversationLimitStatus = conversation_limit_status(
        settings,
        billing_payload,
        used=total_conversations,
    )
    if quota.blocked:
        raise HTTPException(status_code=403, detail="conversation limit reached")
    conversation_id = app_state.session_manager.new_session_id()
    await app_state.set_session_owner(conversation_id, user.user_id)
    return ConversationCreateResponse(conversation_id=conversation_id)


@router.get("/me", response_model=AccountSnapshot)
async def account_snapshot_endpoint(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> AccountSnapshot:
    try:
        db = request.app.state.history_store
        account_user = await ensure_user(
            db,
            user,
        )
        billing_service = request.app.state.app_state.billing_service
        billing_payload = billing_service.user_status_payload(account_user)
        settings = request.app.state.app_state.settings
        total_conversations = await count_conversations(db, user_id=account_user.id)
        quota: ConversationLimitStatus = conversation_limit_status(
            settings,
            billing_payload,
            used=total_conversations,
        )

        return AccountSnapshot(
            user=UserResponse(
                id=account_user.id,
                email=account_user.email,
                name=account_user.name,
                avatar_url=account_user.avatar_url,
                created_at=account_user.created_at,
                last_login_at=account_user.last_login_at,
                learning_lang=account_user.learning_lang,
                native_lang=account_user.native_lang,
                language_level=account_user.language_level,
                email_verified=account_user.email_verified,
                subscription_status=account_user.subscription_status,
                subscription_plan=account_user.subscription_plan,
                subscription_interval=account_user.subscription_interval,
                subscription_current_period_end=account_user.subscription_current_period_end,
                subscription_cancel_at=account_user.subscription_cancel_at,
                subscription_cancel_at_period_end=account_user.subscription_cancel_at_period_end,
                billing_exempt=bool(account_user.billing_exempt),
            ),
            billing=BillingStatusResponse(**billing_payload),
            limits=AccountLimitsResponse(
                conversations=ConversationLimitResponse(
                    enabled=quota.enabled,
                    limit=quota.limit,
                    used=quota.used,
                    remaining=quota.remaining,
                    blocked=quota.blocked,
                )
            ),
        )
    except Exception as exc:
        import traceback

        print(f"[/me] Error creating account snapshot for user {user.user_id}: {exc}")
        print(f"[/me] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create account snapshot: {str(exc)}") from exc


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
            ConversationSummary(**serialize_summary(convo, partner=partner_map.get(convo.partner_id or "")))
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
    session_manager = request.app.state.app_state.session_manager
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    memory_records: list[dict[str, Any]] = []
    if memory_adapter is not None:
        try:
            records = await memory_adapter.list_conversation_memories(
                user_id=user.user_id,
                conversation_id=conversation_id,
                limit=50,
            )
            for record in records:
                memory_records.append(MemoryRecordResponse(**record).model_dump())
        except Exception as exc:
            LOGGER.error("[ConversationDetail] Failed to load memories: %s", exc)

    return ConversationDetail(
        **serialize_detail(
            convo,
            partner=partner,
            memories=memory_records,
        )
    )


class UpdateConversationRequest(BaseModel):
    title: str | None = None


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

    session_manager = request.app.state.app_state.session_manager
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    llm_adapter = getattr(session_manager, "llm_adapter", None)
    if memory_adapter and llm_adapter and convo.messages:
        started_epoch = convo.started_at.timestamp() if convo.started_at else None
        ended_epoch = convo.ended_at.timestamp() if convo.ended_at else None
        try:
            entries = await build_memory_entries_with_llm(
                llm_adapter,
                convo.messages,
                convo.native_lang,
                partner.name,
            )
        except Exception as exc:
            entries = []
            LOGGER.debug("[Conversations] Memory extraction skipped for reassignment: %s", exc)

        if entries:
            try:
                await memory_adapter.persist_memory_records(
                    user_id=user.user_id,
                    conversation_id=conversation_id,
                    entries=entries,
                    partner_id=partner.id,
                    language_code=convo.learning_lang,
                    native_language_code=convo.native_lang,
                    started_at=started_epoch,
                    ended_at=ended_epoch,
                )
            except Exception as exc:
                LOGGER.warning(
                    "[Conversations] Failed to persist reassigned memories conversation=%s: %s",
                    conversation_id,
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


class ConversationMemoriesResponse(BaseModel):
    """Memories associated with a conversation."""

    memories: list[MemoryRecordResponse]
    processing: bool  # True if extraction is still running


class ConversationContextRange(BaseModel):
    start: str | None = None
    end: str | None = None


class ConversationContextItem(BaseModel):
    type: Literal["fact", "entity", "episode", "unknown", "context"]
    text: str
    label: str | None = None
    range: ConversationContextRange | None = None


class ConversationThreadContextResponse(BaseModel):
    """Thread context string returned by the memory backend."""

    items: list[ConversationContextItem]
    raw_context: str | None = None


@router.get("/conversations/{conversation_id}/context", response_model=ConversationThreadContextResponse)
async def get_conversation_context(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationThreadContextResponse:
    """Return the summarized conversation context for this conversation."""
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
        raw_context = await memory_adapter.get_context_for_prompt(
            conversation_id=conversation_id,
            user_id=user.user_id,
            scope="hybrid",
        )
    except Exception as exc:
        logger.error("[ConversationContext] Failed to build context: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch conversation context") from exc

    normalized_items: list[ConversationContextItem] = []
    for line in (raw_context or "").splitlines():
        text = line.strip()
        if not text:
            continue
        normalized_items.append(
            ConversationContextItem(
                type="context",
                text=text,
                label=None,
                range=None,
            )
        )

    return ConversationThreadContextResponse(
        items=normalized_items,
        raw_context=raw_context or None,
    )


@router.get("/conversations/{conversation_id}/memories", response_model=ConversationMemoriesResponse)
async def get_conversation_memories(
    request: Request,
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ConversationMemoriesResponse:
    """Return stored insights for a conversation."""
    db = request.app.state.history_store
    convo = await get_conversation_detail(
        db,
        user_id=user.user_id,
        conversation_id=conversation_id,
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    session_manager = request.app.state.app_state.session_manager
    memory_adapter = getattr(session_manager, "memory_adapter", None)
    if memory_adapter is None:
        raise HTTPException(status_code=503, detail="Memory adapter unavailable")

    try:
        records = await memory_adapter.list_conversation_memories(
            user_id=user.user_id,
            conversation_id=conversation_id,
            limit=50,
        )
    except Exception as exc:
        LOGGER.error("[ConversationMemories] Failed to list records: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch conversation memories") from exc

    items: list[MemoryRecordResponse] = []
    for record in records:
        payload = dict(record)
        payload.setdefault("conversation_id", conversation_id)
        payload.setdefault("scope", "user")
        payload.setdefault("category", "fact")
        payload.setdefault("retention", "long_term")
        payload.setdefault("importance", 50)
        payload.setdefault("retention_expires_at", None)
        payload.setdefault("created_at", None)
        payload.setdefault("updated_at", None)
        items.append(MemoryRecordResponse(**payload))

    processing = await session_manager.is_memory_pending(conversation_id)
    return ConversationMemoriesResponse(memories=items, processing=processing)
