"""SQLAlchemy models and helpers for persistent account storage."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

LOGGER = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class AccountUser(Base):
    __tablename__ = "account_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Bonus minutes: Extra usage allowance that can be used after daily free minutes are exhausted
    bonus_minutes: Mapped[int | None] = mapped_column(default=None)
    # Email verification
    email_verified: Mapped[bool] = mapped_column(default=False)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    verification_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # User language preferences
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    proficiency: Mapped[str | None] = mapped_column(String(32), nullable=True)

    conversations: Mapped[list["AccountConversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    partners: Mapped[list["ConversationPartner"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ConversationPartner(Base):
    __tablename__ = "conversation_partners"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("account_users.id", ondelete="CASCADE"),
        nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(64), index=True)
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["AccountUser"] = relationship(back_populates="partners")


class AccountConversation(Base):
    __tablename__ = "account_conversations"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    scores: Mapped[dict[str, Any] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    # extracted_info removed - memory extraction is now handled by Zep
    messages: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    partner_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("conversation_partners.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    participant_snapshot: Mapped[dict[str, Any] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )

    user: Mapped[AccountUser] = relationship(back_populates="conversations")
    partner: Mapped["ConversationPartner"] = relationship()


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# AccountMemory model removed - all memory management now in Zep Cloud Knowledge Graph


class PersistenceDatabase:
    """Async SQLAlchemy helper for PostgreSQL-based persistent account storage."""

    def __init__(self, url: str) -> None:
        # Log database connection info (mask password for security)
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            if parsed.password:
                masked_url = f"{parsed.scheme}://{parsed.username}:***@{parsed.hostname}:{parsed.port}{parsed.path}"
            else:
                masked_url = url
            LOGGER.info(f"🔧 Database URL configured: {masked_url}")
        except Exception:
            LOGGER.info("🔧 Database URL configured (parsing failed)")
        
        self.engine = create_async_engine(url, future=True)
        self._sessionmaker = async_sessionmaker(
            self.engine, expire_on_commit=False, class_=AsyncSession
        )

    async def init_models(self) -> None:
        """Initialize database models and apply migrations."""
        LOGGER.info("Testing database connection...")
        try:
            async with self.engine.begin() as conn:
                # Create all tables
                await conn.run_sync(Base.metadata.create_all)
                
                # Apply migrations for existing databases
                await self._apply_migrations(conn)
            
            LOGGER.info("✅ Database connected and initialized")
        except Exception as e:
            LOGGER.error(f"❌ Database connection or initialization failed: {e}")
            raise
    
    async def _apply_migrations(self, conn) -> None:
        """Apply schema migrations for existing databases.
        
        Note: For complex migrations, consider using Alembic.
        """
        ...

    def session(self) -> async_sessionmaker[AsyncSession]:
        return self._sessionmaker
