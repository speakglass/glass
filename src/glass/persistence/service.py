"""High-level helpers for account persistence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
import uuid
import secrets
import re

from sqlalchemy import select, delete, or_
from sqlalchemy.exc import IntegrityError

from ..auth.jwt import AuthenticatedUser
from .db import (
    AccountConversation,
    AccountUser,
    ConversationPartner,
    PasswordResetToken,
    PersistenceDatabase,
)

DEFAULT_PARTNERS: list[dict[str, Any]] = [
    {
        "slug": "en_emma",
        "learning_lang": "en",
        "native_lang": "en",
        "name": "Emma",
        "description": "London marketer who swaps idioms over coffee chats",
        "avatar_asset": "emma.png",
        "voice_id": "cgSgspJ2msm6clMCkdW9",
    },
    {
        "slug": "en_alex",
        "learning_lang": "en",
        "native_lang": "en",
        "name": "Alex",
        "description": "New York product lead who loves travel podcasts",
        "avatar_asset": "alex.png",
        "voice_id": "IKne3meq5aSn9XLyUdCD",
    },
    {
        "slug": "ko_jiwoo",
        "learning_lang": "ko",
        "native_lang": "ko",
        "name": "Jiwoo",
        "description": "Busan travel vlogger sharing food spots and K-drama gossip",
        "avatar_asset": "jiwoo.png",
        "voice_id": "8jHHF8rMqMlg8if2mOUe",
    },
    {
        "slug": "ko_minjun",
        "learning_lang": "ko",
        "native_lang": "ko",
        "name": "Minjun",
        "description": "Seoul software engineer comparing K-pop drops",
        "avatar_asset": "minjun.png",
        "voice_id": "UgBBYS2sOqTuMpoF3BR0",
    },
    {
        "slug": "ja_yui",
        "learning_lang": "ja",
        "native_lang": "ja",
        "name": "Yui",
        "description": "Tokyo cafe owner chatting anime and study tips",
        "avatar_asset": "yui.png",
        "voice_id": "fUjY9K2nAIwlALOwSiwc",
    },
    {
        "slug": "ja_haruto",
        "learning_lang": "ja",
        "native_lang": "ja",
        "name": "Haruto",
        "description": "Osaka game developer into live music and baseball",
        "avatar_asset": "haruto.png",
        "voice_id": "3JDquces8E8bkmvbh6Bc",
    },
    {
        "slug": "zh_mei",
        "learning_lang": "zh",
        "native_lang": "zh",
        "name": "Mei",
        "description": "Shanghai UX writer who loves tea tastings",
        "avatar_asset": "mei.png",
        "voice_id": "tOuLUAIdXShmWH7PEUrU",
    },
    {
        "slug": "zh_liwei",
        "learning_lang": "zh",
        "native_lang": "zh",
        "name": "Liwei",
        "description": "Beijing PM trading startup news and hiking recs",
        "avatar_asset": "liwei.png",
        "voice_id": "fQj4gJSexpu8RDE2Ii5m",
    },
    {
        "slug": "es_camila",
        "learning_lang": "es",
        "native_lang": "es",
        "name": "Camila",
        "description": "Mexico City DJ sharing reggaeton drops",
        "avatar_asset": "camila.png",
        "voice_id": "qHkrJuifPpn95wK3rm2A",
    },
    {
        "slug": "es_diego",
        "learning_lang": "es",
        "native_lang": "es",
        "name": "Diego",
        "description": "Madrid sports journalist debating La Liga",
        "avatar_asset": "diego.png",
        "voice_id": "94zOad0g7T7K4oa7zhDq",
    },
    {
        "slug": "fr_claire",
        "learning_lang": "fr",
        "native_lang": "fr",
        "name": "Claire",
        "description": "Paris strategist mixing pastry tips with work talk",
        "avatar_asset": "claire.png",
        "voice_id": "F1toM6PcP54s45kOOAyV",
    },
    {
        "slug": "fr_luc",
        "learning_lang": "fr",
        "native_lang": "fr",
        "name": "Luc",
        "description": "Lyon designer into cycling tours and indie cinema",
        "avatar_asset": "luc.png",
        "voice_id": "93nuHbke4dTER9x2pDwE",
    },
]


def _build_avatar_url(asset: str | None, explicit: str | None = None) -> str | None:
    if explicit:
        return explicit
    if asset:
        return f"/partners/{asset}"
    return None


def _build_template_metadata(entry: dict[str, Any]) -> dict[str, Any] | None:
    metadata = dict(entry.get("metadata") or {})
    avatar_asset = entry.get("avatar_asset")
    if avatar_asset:
        metadata.setdefault("avatar_asset", avatar_asset)
    metadata.setdefault("template_slug", entry["slug"])
    return metadata or None


def _merge_metadata(existing: dict[str, Any] | None, new_meta: dict[str, Any] | None) -> dict[str, Any] | None:
    if not new_meta:
        return existing
    merged = dict(existing or {})
    merged.update(new_meta)
    return merged


def _slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[-\s]+", "-", value)
    return value.strip("-")


async def _generate_unique_slug(session, name: str) -> str:
    base = _slugify(name) or "partner"
    slug = base
    suffix = 2
    while True:
        exists = await session.scalar(
            select(ConversationPartner.id).where(ConversationPartner.slug == slug)
        )
        if not exists:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


def _build_live_call_placeholder_name() -> str:
    suffix = secrets.randbelow(1_000)
    return f"Anonymous_{suffix:03d}"


async def ensure_default_partners(db: PersistenceDatabase) -> None:
    """Seed default partners for each learning language (idempotent)."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        updated = False
        for data in DEFAULT_PARTNERS:
            existing = await session.scalar(
                select(ConversationPartner).where(ConversationPartner.slug == data["slug"])
            )
            avatar_url = _build_avatar_url(data.get("avatar_asset"), data.get("avatar_url"))
            metadata = _build_template_metadata(data)
            if existing:
                changed = False
                for field in ("name", "description", "avatar_url", "learning_lang", "native_lang", "voice_id"):
                    if field == "avatar_url":
                        new_value = avatar_url
                    else:
                        new_value = data.get(field)
                    if getattr(existing, field) != new_value:
                        setattr(existing, field, new_value)
                        changed = True
                if not existing.is_system:
                    existing.is_system = True
                    changed = True
                if not existing.is_active:
                    existing.is_active = True
                    changed = True
                if metadata and existing.extra_metadata != metadata:
                    existing.extra_metadata = metadata
                    changed = True
                if changed:
                    session.add(existing)
                    updated = True
            else:
                partner = ConversationPartner(
                    slug=data["slug"],
                    learning_lang=data.get("learning_lang"),
                    native_lang=data.get("native_lang"),
                    name=data["name"],
                    description=data.get("description"),
                    avatar_url=avatar_url,
                    voice_id=data.get("voice_id"),
                    extra_metadata=metadata,
                    is_system=True,
                    is_active=True,
                )
                session.add(partner)
                updated = True
        if updated:
            await session.commit()


async def ensure_user_partner_templates(db: PersistenceDatabase, user_id: str) -> None:
    """Ensure user has personalized copies of every system partner template."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user_partners_result = await session.scalars(
            select(ConversationPartner)
            .where(
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        user_partners = list(user_partners_result)
        existing_template_slugs: set[str] = set()
        for partner in user_partners:
            meta = partner.extra_metadata or {}
            if isinstance(meta, dict):
                template_slug = meta.get("template_slug")
                if template_slug:
                    existing_template_slugs.add(template_slug)

        system_partners_result = await session.scalars(
            select(ConversationPartner)
            .where(
                ConversationPartner.is_system.is_(True),
                ConversationPartner.is_active.is_(True),
            )
            .order_by(ConversationPartner.name.asc())
        )
        system_partners = list(system_partners_result)
        created = False
        for template in system_partners:
            template_slug = template.slug
            if template_slug in existing_template_slugs:
                continue
            slug = await _generate_unique_slug(session, template.name)
            clone_metadata = dict(template.extra_metadata or {})
            clone_metadata["template_slug"] = template_slug
            clone = ConversationPartner(
                user_id=user_id,
                slug=slug,
                learning_lang=template.learning_lang,
                native_lang=template.native_lang,
                name=template.name,
                description=template.description,
                avatar_url=template.avatar_url,
                voice_id=template.voice_id,
                extra_metadata=clone_metadata or None,
                is_system=False,
                is_active=True,
            )
            session.add(clone)
            created = True
        if created:
            await session.commit()


async def list_partners(
    db: PersistenceDatabase,
    user_id: str,
    *,
    learning_lang: str | None = None,
) -> list[ConversationPartner]:
    """List available partners (system defaults + user-custom)."""
    await ensure_user_partner_templates(db, user_id)
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = (
            select(ConversationPartner)
            .where(
                ConversationPartner.is_active.is_(True),
                ConversationPartner.user_id == user_id,
            )
        )
        if learning_lang:
            stmt = stmt.where(
                ConversationPartner.learning_lang == learning_lang
            )
        stmt = stmt.order_by(
            ConversationPartner.user_id.isnot(None),
            ConversationPartner.name.asc(),
        )
        result = await session.scalars(stmt)
        return list(result.all())


async def ensure_live_session_partner(
    db: PersistenceDatabase,
    *,
    user_id: str,
    session_id: str,
    learning_lang: str | None = None,
    native_lang: str | None = None,
) -> ConversationPartner:
    """Create (or fetch) a placeholder partner for a specific live-call session.

    Placeholder partners let us persist FK references even if the user didn't
    pre-select a partner before starting the call. Users can later edit or
    merge these placeholders into real partners.
    """
    partner_id = f"live:{session_id}"
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.get(ConversationPartner, partner_id)
        if partner:
            return partner

        slug = f"live-call-{session_id}"[:64]
        name = _build_live_call_placeholder_name()
        partner = ConversationPartner(
            id=partner_id,
            user_id=user_id,
            slug=slug,
            learning_lang=learning_lang,
            native_lang=native_lang,
            name=name,
            description=None,
            avatar_url=None,
            voice_id=None,
            extra_metadata={
                "type": "live_call",
                "session_id": session_id,
            },
            is_system=False,
            is_active=True,
        )
        session.add(partner)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            partner = await session.get(ConversationPartner, partner_id)
            if partner:
                return partner
            raise
        await session.refresh(partner)
        return partner


async def update_partner_details(
    db: PersistenceDatabase,
    partner_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> ConversationPartner | None:
    """Update selected partner fields without enforcing API permissions."""
    if not any([name, description, extra_metadata]):
        return None
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.get(ConversationPartner, partner_id)
        if not partner:
            return None
        changed = False
        if name and name.strip() and name != partner.name:
            partner.name = name.strip()
            changed = True
        if description is not None and description != partner.description:
            partner.description = description
            changed = True
        if extra_metadata is not None:
            merged = dict(partner.extra_metadata or {})
            merged.update(extra_metadata)
            if merged != (partner.extra_metadata or {}):
                partner.extra_metadata = merged
                changed = True
        if not changed:
            return partner
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def reassign_conversation_partner(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
    partner_id: str,
) -> tuple[AccountConversation, ConversationPartner, str | None] | tuple[None, None, None]:
    """Assign an existing partner to a saved conversation."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        convo = await session.scalar(
            select(AccountConversation).where(
                AccountConversation.id == conversation_id,
                AccountConversation.user_id == user_id,
            )
        )
        if convo is None:
            return None, None, None

        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.is_active.is_(True),
                or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None)),
            )
        )
        if partner is None:
            raise ValueError("Partner not found or unavailable")

        snapshot = convo.participant_snapshot or {}
        session_info = snapshot.get("session") or {}
        session_mode = session_info.get("mode")
        if isinstance(session_mode, str) and session_mode.lower() == "roleplay":
            raise PermissionError("Roleplay conversations cannot be reassigned")

        old_partner_id = convo.partner_id
        normalized_old = (old_partner_id or "").lower()
        normalized_new = partner_id.lower()

        messages = convo.messages or []
        updated_messages = []
        changed_messages = False
        for msg in messages:
            updated = dict(msg)
            msg_partner_id = (updated.get("partner_id") or "").lower()
            msg_role = (updated.get("role") or "").lower()
            if msg_partner_id == normalized_old or (not msg_partner_id and msg_role == "partner"):
                updated["partner_id"] = partner_id
                changed_messages = True
            updated_messages.append(updated)
        if changed_messages:
            convo.messages = updated_messages

        snapshot = dict(convo.participant_snapshot or {})
        snapshot["partner"] = {
            "id": partner.id,
            "name": partner.name,
            "description": partner.description,
            "avatar_url": partner.avatar_url,
            "voice_id": partner.voice_id,
            "learning_lang": partner.learning_lang,
            "native_lang": partner.native_lang,
            "is_system": partner.user_id is None,
        }
        convo.participant_snapshot = snapshot
        convo.partner_id = partner.id

        session.add(convo)
        await session.commit()
        await session.refresh(convo)
        return convo, partner, old_partner_id


async def get_partner_by_id(
    db: PersistenceDatabase,
    partner_id: str,
    *,
    user_id: str | None = None,
) -> ConversationPartner | None:
    """Fetch a partner ensuring the requesting user has access."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(ConversationPartner).where(
            ConversationPartner.id == partner_id,
            ConversationPartner.is_active.is_(True),
        )
        if user_id is not None:
            stmt = stmt.where(
                or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None))
            )
        return await session.scalar(stmt)


async def create_partner(
    db: PersistenceDatabase,
    user_id: str,
    *,
    name: str,
    description: str | None = None,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    avatar_url: str | None = None,
    voice_id: str | None = None,
) -> ConversationPartner:
    """Create a custom partner for a user."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        slug = await _generate_unique_slug(session, name)
        partner = ConversationPartner(
            user_id=user_id,
            slug=slug,
            learning_lang=learning_lang,
            native_lang=native_lang,
            name=name,
            description=description,
            avatar_url=avatar_url,
            voice_id=voice_id,
            extra_metadata=None,
            is_system=False,
            is_active=True,
        )
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def update_partner(
    db: PersistenceDatabase,
    partner_id: str,
    user_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    avatar_url: str | None = None,
    voice_id: str | None = None,
) -> ConversationPartner:
    """Update a partner owned by the user."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        if not partner:
            raise ValueError("Partner not found")
        if name:
            partner.name = name
        if description is not None:
            partner.description = description
        if learning_lang is not None:
            partner.learning_lang = learning_lang
        if native_lang is not None:
            partner.native_lang = native_lang
        if avatar_url is not None:
            partner.avatar_url = avatar_url
        if voice_id is not None:
            partner.voice_id = voice_id
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def delete_partner(
    db: PersistenceDatabase,
    partner_id: str,
    user_id: str,
) -> None:
    """Soft-delete a partner."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        if not partner:
            raise ValueError("Partner not found")
        partner.is_active = False
        session.add(partner)
        await session.commit()


async def ensure_user(
    db: PersistenceDatabase,
    claims: AuthenticatedUser,
    *,
    bonus_minutes: int | None = None,
) -> AccountUser:
    """Create or update an account user from the authenticated claims."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"[ensure_user] Starting for user_id={claims.user_id}, email={claims.email}")
        async_session_factory = db.session()
        async with async_session_factory() as session:
            user = await session.scalar(
                select(AccountUser).where(AccountUser.id == claims.user_id)
            )
            now = datetime.now(timezone.utc)
            if user:
                logger.info(f"[ensure_user] User exists, updating: {claims.user_id}")
                user.email = claims.email
                user.name = claims.name
                user.avatar_url = claims.avatar_url
                user.last_login_at = now
            else:
                logger.info(f"[ensure_user] Creating new user: {claims.user_id}")
                user = AccountUser(
                    id=claims.user_id,
                    email=claims.email,
                    name=claims.name,
                    avatar_url=claims.avatar_url,
                    bonus_minutes=bonus_minutes,
                    last_login_at=now,
                )
                session.add(user)
            await session.commit()
            await session.refresh(user)
            logger.info(f"[ensure_user] Success for user_id={claims.user_id}")
            return user
    except Exception as exc:
        logger.error(f"[ensure_user] Error for user_id={claims.user_id}: {exc}", exc_info=True)
        raise


async def upsert_conversation(
    db: PersistenceDatabase,
    *,
    user_id: str,
    session_id: str,
    title: str | None,
    summary: str | None,
    feedback: str | None,
    scores: dict[str, Any] | None,
    messages: list[dict[str, Any]] | None,
    learning_lang: str | None,
    native_lang: str | None,
    started_at: datetime,
    ended_at: datetime | None,
    duration_seconds: int | None,
    partner_id: str | None = None,
    participant_snapshot: dict[str, Any] | None = None,
    memory_insights: dict[str, Any] | None = None,
) -> AccountConversation:
    """Persist a conversation summary for later review.
    
    Note: extracted_info removed - memory extraction is now handled by Zep.
    """
    async_session_factory = db.session()
    async with async_session_factory() as session:
        convo = await session.scalar(
            select(AccountConversation).where(AccountConversation.session_id == session_id)
        )
        if convo:
            convo.title = title or convo.title
            convo.summary = summary or convo.summary
            convo.feedback = feedback
            convo.scores = scores
            convo.messages = messages
            convo.learning_lang = learning_lang
            convo.native_lang = native_lang
            convo.started_at = started_at
            convo.ended_at = ended_at
            convo.duration_seconds = duration_seconds
            if partner_id is not None:
                convo.partner_id = partner_id
            if participant_snapshot is not None:
                convo.participant_snapshot = participant_snapshot
            if memory_insights is not None:
                convo.memory_insights = memory_insights
        else:
            convo = AccountConversation(
                user_id=user_id,
                session_id=session_id,
                title=title,
                summary=summary,
                feedback=feedback,
                scores=scores,
                messages=messages,
                learning_lang=learning_lang,
                native_lang=native_lang,
                started_at=started_at,
                ended_at=ended_at,
                duration_seconds=duration_seconds,
                partner_id=partner_id,
                participant_snapshot=participant_snapshot,
                memory_insights=memory_insights,
            )
            session.add(convo)
        await session.commit()
        await session.refresh(convo)
        return convo


async def list_recent_conversations(
    db: PersistenceDatabase,
    *,
    user_id: str,
    limit: int,
    offset: int = 0,
    search: str | None = None,
) -> list[AccountConversation]:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = (
            select(AccountConversation)
            .where(AccountConversation.user_id == user_id)
        )
        
        # Add search filter if provided
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                (AccountConversation.title.ilike(search_pattern)) |
                (AccountConversation.summary.ilike(search_pattern))
            )
        
        stmt = (
            stmt
            .order_by(AccountConversation.started_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await session.scalars(stmt)
        return list(result.all())


async def get_partners_by_ids(
    db: PersistenceDatabase,
    *,
    user_id: str,
    partner_ids: Iterable[str],
) -> dict[str, ConversationPartner]:
    """Fetch active partners visible to the user for the provided IDs."""
    normalized_ids = {pid for pid in (pid.strip() for pid in partner_ids) if pid}
    if not normalized_ids:
        return {}
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(ConversationPartner).where(
            ConversationPartner.id.in_(normalized_ids),
            ConversationPartner.is_active.is_(True),
            or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None)),
        )
        result = await session.scalars(stmt)
        partners = result.all()
    return {partner.id: partner for partner in partners}


async def count_conversations(
    db: PersistenceDatabase,
    *,
    user_id: str,
    search: str | None = None,
) -> int:
    """Count total conversations for pagination."""
    from sqlalchemy import func
    
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = (
            select(func.count())
            .select_from(AccountConversation)
            .where(AccountConversation.user_id == user_id)
        )
        
        # Add search filter if provided
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                (AccountConversation.title.ilike(search_pattern)) |
                (AccountConversation.summary.ilike(search_pattern))
            )
        
        result = await session.scalar(stmt)
        return result or 0


async def get_conversation_detail(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
) -> AccountConversation | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountConversation).where(
            AccountConversation.user_id == user_id,
            AccountConversation.id == conversation_id,
        )
        return await session.scalar(stmt)


async def delete_conversation(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
) -> bool:
    """Delete a conversation by ID. Returns True if deleted, False if not found."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = delete(AccountConversation).where(
            AccountConversation.user_id == user_id,
            AccountConversation.id == conversation_id,
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0


async def update_conversation_title(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
    title: str | None = None,
    memory_insights: dict[str, Any] | None = None,
) -> AccountConversation | None:
    """Update the title of a conversation. Returns the updated conversation or None if not found."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        convo = await session.scalar(
            select(AccountConversation).where(
                AccountConversation.user_id == user_id,
                AccountConversation.id == conversation_id,
            )
        )
        if not convo:
            return None
        if title is not None:
            convo.title = title
        if memory_insights is not None:
            convo.memory_insights = memory_insights
        await session.commit()
        await session.refresh(convo)
        return convo


async def get_user_by_email(
    db: PersistenceDatabase,
    email: str,
) -> AccountUser | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.email == email)
        return await session.scalar(stmt)


async def create_local_user(
    db: PersistenceDatabase,
    *,
    email: str,
    password_hash: str | None = None,
    name: str | None = None,
    avatar_url: str | None = None,
    email_verified: bool = False,
    bonus_minutes: int | None = None,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = AccountUser(
            id=uuid.uuid4().hex,
            email=email,
            name=name,
            password_hash=password_hash,
            avatar_url=avatar_url,
            email_verified=email_verified,
            bonus_minutes=bonus_minutes,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def set_user_password(
    db: PersistenceDatabase,
    *,
    user_id: str,
    password_hash: str,
    name: str | None = None,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(
            select(AccountUser).where(AccountUser.id == user_id)
        )
        if user is None:
            raise ValueError("User not found")
        user.password_hash = password_hash
        if name and not user.name:
            user.name = name
        await session.commit()
        await session.refresh(user)
        return user


async def create_password_reset_token(
    db: PersistenceDatabase,
    *,
    user_id: str,
    expires_in_hours: int = 1,
) -> str:
    """Create a password reset token for a user."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    
    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = PasswordResetToken(
            user_id=user_id,
            token=token,
            expires_at=expires_at,
        )
        session.add(reset_token)
        await session.commit()
        return token


async def verify_reset_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Verify a password reset token and return the user if valid."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = await session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.token == token)
        )
        if not reset_token:
            return None
        
        # Check if token is expired or already used
        now = datetime.now(timezone.utc)
        if reset_token.expires_at < now or reset_token.used:
            return None
        
        # Get the user
        user = await session.scalar(
            select(AccountUser).where(AccountUser.id == reset_token.user_id)
        )
        return user


async def mark_token_as_used(
    db: PersistenceDatabase,
    token: str,
) -> None:
    """Mark a reset token as used."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = await session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.token == token)
        )
        if reset_token:
            reset_token.used = True
            await session.commit()


async def get_user_by_id(
    db: PersistenceDatabase,
    user_id: str,
) -> AccountUser | None:
    """Get a user by their ID."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.id == user_id)
        return await session.scalar(stmt)


async def mark_onboarding_completed(
    db: PersistenceDatabase,
    user_id: str,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    language_level: str | None = None,
) -> AccountUser:
    """Mark onboarding as completed for a user and save language preferences."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(
            select(AccountUser).where(AccountUser.id == user_id)
        )
        if user is None:
            raise ValueError("User not found")
        
        # Only set if not already completed
        if user.onboarding_completed_at is None:
            user.onboarding_completed_at = datetime.now(timezone.utc)
        
        # Save language preferences
        if learning_lang:
            user.learning_lang = learning_lang
        if native_lang:
            user.native_lang = native_lang
        if language_level:
            user.language_level = language_level
        
        await session.commit()
        await session.refresh(user)
        return user


# ===== Email Verification =====

async def create_verification_token(
    db: PersistenceDatabase,
    user_id: str,
) -> tuple[str, datetime]:
    """Create an email verification token for a user.
    
    Returns:
        Tuple of (token, expires_at)
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(
            select(AccountUser).where(AccountUser.id == user_id)
        )
        if user is None:
            raise ValueError("User not found")
        
        user.verification_token = token
        user.verification_token_expires = expires_at
        
        await session.commit()
        await session.refresh(user)
        return token, expires_at


async def verify_email_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Verify an email verification token and mark email as verified.
    
    Returns:
        User if token is valid, None otherwise
    """
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(
            select(AccountUser).where(AccountUser.verification_token == token)
        )
        
        if user is None:
            return None
        
        # Check if token is expired
        if user.verification_token_expires is None or user.verification_token_expires < datetime.now(timezone.utc):
            return None
        
        # Mark email as verified and clear token
        user.email_verified = True
        user.verification_token = None
        user.verification_token_expires = None
        
        await session.commit()
        await session.refresh(user)
        return user


async def get_user_by_verification_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Get a user by their verification token."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(
            select(AccountUser).where(AccountUser.verification_token == token)
        )
        return user


# ===== Memory Operations =====
# All memory management now handled by Zep Cloud Knowledge Graph
# See: src/glass/adapters/memory/zep.py for Zep graph operations
