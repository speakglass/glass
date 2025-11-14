"""High-level helpers for account persistence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid
import secrets

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.jwt import AuthenticatedUser
from .db import AccountConversation, AccountUser, PasswordResetToken, PersistenceDatabase


async def ensure_user(
    db: PersistenceDatabase,
    claims: AuthenticatedUser,
    *,
    trial_minutes: int | None = None,
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
                    trial_minutes=trial_minutes,
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
    title: str,
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
        
        convo.title = title
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
    password_hash: str,
    name: str | None = None,
    avatar_url: str | None = None,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = AccountUser(
            id=uuid.uuid4().hex,
            email=email,
            name=name,
            password_hash=password_hash,
            avatar_url=avatar_url,
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
    proficiency: str | None = None,
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
        if proficiency:
            user.proficiency = proficiency
        
        await session.commit()
        await session.refresh(user)
        return user


# ===== Memory Operations =====
# All memory management now handled by Zep Cloud Knowledge Graph
# See: src/glass/adapters/memory/zep.py for Zep graph operations
