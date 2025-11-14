"""SQLAlchemy models and helpers for persistent account storage."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class AccountUser(Base):
    __tablename__ = "account_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trial_minutes: Mapped[int | None] = mapped_column(default=None)
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

    user: Mapped[AccountUser] = relationship(back_populates="conversations")


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
        self.engine = create_async_engine(url, future=True)
        self._sessionmaker = async_sessionmaker(
            self.engine, expire_on_commit=False, class_=AsyncSession
        )

    async def init_models(self) -> None:
        """Initialize database models and apply migrations."""
        async with self.engine.begin() as conn:
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            
            # Apply migrations for existing databases
            await self._apply_migrations(conn)
    
    async def _apply_migrations(self, conn) -> None:
        """Apply schema migrations for existing databases.
        
        Note: For complex migrations, consider using Alembic.
        """
        ...

    def session(self) -> async_sessionmaker[AsyncSession]:
        return self._sessionmaker
