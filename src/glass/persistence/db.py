"""SQLAlchemy models and helpers for persistent account storage."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    Index,
    UniqueConstraint,
    JSON,
)

# Import pgvector types
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None
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
    # Email verification
    email_verified: Mapped[bool] = mapped_column(default=False)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    verification_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # User language preferences
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    language_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    subscription_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    subscription_plan: Mapped[str | None] = mapped_column(String(32), nullable=True)
    subscription_interval: Mapped[str | None] = mapped_column(String(16), nullable=True)
    subscription_current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_cancel_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_cancel_at_period_end: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    billing_exempt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    conversations: Mapped[list["AccountConversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    partners: Mapped[list["ConversationPartner"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ConversationPartner(Base):
    __tablename__ = "conversation_partners"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("account_users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="roleplay")
    persona_age: Mapped[str | None] = mapped_column(String(32), nullable=True)
    persona_gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    persona_occupation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    persona_city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    persona_country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    persona_relationship: Mapped[str | None] = mapped_column(String(64), nullable=True)
    persona_background: Mapped[str | None] = mapped_column(Text, nullable=True)
    persona_interests: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["AccountUser"] = relationship(back_populates="partners")


class AccountConversation(Base):
    __tablename__ = "account_conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True)
    partner_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("conversation_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    native_lang: Mapped[str | None] = mapped_column(String(32), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[AccountUser] = relationship(back_populates="conversations")
    partner: Mapped["ConversationPartner"] = relationship()
    conversation_messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    evaluations: Mapped[list["ConversationEvaluation"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    feedback_entries: Mapped[list["MessageFeedback"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
    )

    @property
    def session_id(self) -> str:
        """Backwards-compatible alias for the primary key."""
        return self.id

    def _latest_evaluation(self) -> "ConversationEvaluation | None":
        if not self.evaluations:
            return None
        return max(self.evaluations, key=lambda ev: ev.created_at or datetime.min)

    @property
    def scores(self) -> dict[str, int] | None:
        evaluation = self._latest_evaluation()
        if not evaluation:
            return None
        return {
            "fluency": evaluation.fluency_score,
            "accuracy": evaluation.accuracy_score,
            "comprehensibility": evaluation.expression_score,
            "overall": evaluation.overall_score,
        }

    @property
    def feedback(self) -> str | None:
        evaluation = self._latest_evaluation()
        return evaluation.overall_feedback if evaluation else None

    @property
    def messages(self) -> list[dict[str, Any]]:
        if not self.conversation_messages:
            return []
        ordered = sorted(self.conversation_messages, key=lambda msg: msg.seq)
        return [message.to_payload() for message in ordered]


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("account_conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    partner_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("conversation_partners.id", ondelete="SET NULL"), nullable=True
    )
    utterance_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    lang_code: Mapped[str] = mapped_column(String(16), nullable=False)
    translation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    translation_lang_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("conversation_id", "seq", name="uq_conversation_messages_conversation_seq"),
        Index("ix_conversation_messages_conversation_id", "conversation_id"),
        Index("ix_conversation_messages_utterance_id", "utterance_id"),
    )
    conversation: Mapped[AccountConversation] = relationship(back_populates="conversation_messages")

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "role": self.role,
            "partner_id": self.partner_id,
            "text": self.text,
            "language": self.lang_code,
            "seq": self.seq,
        }
        if self.utterance_id:
            payload["utterance_id"] = self.utterance_id
        if self.translation_text:
            if self.translation_lang_code:
                payload["translation"] = {
                    "text": self.translation_text,
                    "language": self.translation_lang_code,
                }
            else:
                payload["translation"] = self.translation_text
        return payload


class ConversationEvaluation(Base):
    __tablename__ = "conversation_evaluations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("account_conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True)
    rubric_version: Mapped[str] = mapped_column(String(64), nullable=False)
    fluency_score: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy_score: Mapped[int] = mapped_column(Integer, nullable=False)
    expression_score: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_feedback: Mapped[str] = mapped_column(Text, nullable=False)
    improvement_tips: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_raw: Mapped[dict[str, Any] | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    conversation: Mapped[AccountConversation] = relationship(back_populates="evaluations")


class MessageFeedback(Base):
    __tablename__ = "message_feedback"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("account_conversations.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversation_messages.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True)
    feedback_type: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    span_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    span_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_overall: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    conversation: Mapped[AccountConversation] = relationship(back_populates="feedback_entries")
    message: Mapped[ConversationMessage] = relationship()


class MemoryRecord(Base):
    __tablename__ = "memory_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    conversation_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("account_conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    scope: Mapped[str] = mapped_column(String(32), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    retention: Mapped[str] = mapped_column(String(32), index=True)
    importance: Mapped[int] = mapped_column(default=0)
    text: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    retention_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    content_hash: Mapped[str] = mapped_column(String(64))
    # pgvector embedding for semantic search (1536 dimensions for OpenAI text-embedding-3-small)
    # Note: Using Column (not mapped_column) because Vector is not a standard SQLAlchemy type
    # Note: HNSW index has 2000 dimension limit, so we use 1536 dim model
    embedding = Column(Vector(1536) if Vector else None, nullable=True)

    __table_args__ = (Index("ix_memory_records_user_hash", "user_id", "content_hash", unique=True),)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("account_users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
        self._sessionmaker = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

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
