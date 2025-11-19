"""SQLAlchemy models and helpers for persistent account storage."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func, Index
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
    language_level: Mapped[str | None] = mapped_column(String(32), nullable=True)

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
    # extracted_info removed - durable memory now handled by dedicated adapter
    messages: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    memory_insights: Mapped[dict[str, Any] | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
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


class MemoryThread(Base):
    __tablename__ = "memory_threads"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_interaction_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MemoryMessage(Base):
    __tablename__ = "memory_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    thread_id: Mapped[str] = mapped_column(String(128), ForeignKey("memory_threads.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(32))
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON(none_as_null=True), nullable=True)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_memory_messages_thread_time", "thread_id", "occurred_at"),
    )


class MemoryRecord(Base):
    __tablename__ = "memory_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    thread_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    retention: Mapped[str] = mapped_column(String(32), index=True)
    importance: Mapped[int] = mapped_column(default=0)
    text: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    entities: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON(none_as_null=True), nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    content_hash: Mapped[str] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_memory_records_user_hash", "user_id", "content_hash", unique=True),
    )


class MemoryPersona(Base):
    __tablename__ = "memory_personas"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    native_languages: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    learning_languages: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    traits: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON(none_as_null=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MemoryPartnerProfile(Base):
    __tablename__ = "memory_partner_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    partner_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    relation_to_user: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON(none_as_null=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_memory_partner_profiles_user_partner", "user_id", "partner_id", unique=True),
    )


class MemoryFeedbackRecord(Base):
    __tablename__ = "memory_feedback_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    language_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON(none_as_null=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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


# AccountMemory model removed - centralized memory service persists insights separately


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
