"""Application state containers."""

from __future__ import annotations

import asyncio
import uuid
import logging

from .adapters.asr import build_asr_adapter
from .adapters.websocket import NullEventsAdapter
from .adapters.llm import build_llm_adapter
from .adapters.memory import build_memory_adapter
from .adapters.tts import build_tts_adapter
from .config import Settings
from .domain.session import ConversationSession
from .persistence.db import PersistenceDatabase
from .services.email import EmailService
from .services.billing import StripeService

LOGGER = logging.getLogger(__name__)    

class SessionManager:
    """Registry for session pipelines."""

    def __init__(
        self,
        *,
        asr_adapter,
        llm_adapter,
        memory_adapter,
        tts_adapter=None,
        context_window_size: int = 5,
        redis_client=None,
        pending_memory_ttl: int = 900,
    ) -> None:
        self.asr_adapter = asr_adapter
        self.llm_adapter = llm_adapter
        self.memory_adapter = memory_adapter
        self.tts_adapter = tts_adapter
        self.context_window_size = context_window_size
        self._pipelines: dict[str, ConversationSession] = {}
        self._lock = asyncio.Lock()
        self._pending_memory_conversations: set[str] = set()
        self._redis = redis_client
        self._pending_memory_ttl = pending_memory_ttl

    async def get_or_create(self, session_id: str, events_port=None) -> ConversationSession:
        async with self._lock:
            pipeline = self._pipelines.get(session_id)
            if pipeline is None:
                pipeline = ConversationSession(
                    session_id,
                    asr=self.asr_adapter,
                    llm=self.llm_adapter,
                    memory=self.memory_adapter,
                    tts=self.tts_adapter,
                    events=events_port or NullEventsAdapter(),
                    context_window_size=self.context_window_size,
                )
                self._pipelines[session_id] = pipeline
            else:
                if events_port is not None:
                    pipeline.attach_events(events_port)
            return pipeline

    async def remove_pipeline(self, session_id: str) -> None:
        """Dispose of a session pipeline to free memory after completion."""
        async with self._lock:
            pipeline = self._pipelines.pop(session_id, None)
            if pipeline:
                LOGGER.info("Disposed pipeline for session %s", session_id)

    def _pending_memory_key(self, conversation_id: str) -> str:
        return f"glass:memories:pending:{conversation_id}"

    async def mark_memory_pending(self, conversation_id: str | None) -> None:
        if not conversation_id:
            return
        self._pending_memory_conversations.add(conversation_id)
        if self._redis:
            try:
                await self._redis.set(
                    self._pending_memory_key(conversation_id),
                    "1",
                    ex=self._pending_memory_ttl,
                )
            except Exception as exc:
                LOGGER.debug("Failed to mark pending memory in Redis: %s", exc)

    async def clear_memory_pending(self, conversation_id: str | None) -> None:
        if not conversation_id:
            return
        if conversation_id in self._pending_memory_conversations:
            self._pending_memory_conversations.discard(conversation_id)
        if self._redis:
            try:
                await self._redis.delete(self._pending_memory_key(conversation_id))
            except Exception as exc:
                LOGGER.debug("Failed to clear pending memory in Redis: %s", exc)

    async def is_memory_pending(self, conversation_id: str | None) -> bool:
        if not conversation_id:
            return False
        if self._redis:
            try:
                exists = await self._redis.exists(self._pending_memory_key(conversation_id))
                if exists:
                    return True
            except Exception as exc:
                LOGGER.debug("Failed to read pending memory flag from Redis: %s", exc)
        return conversation_id in self._pending_memory_conversations

    @staticmethod
    def new_session_id() -> str:
        return uuid.uuid4().hex


class AppState:
    """Container for core app singletons."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._redis = None
        
        if settings.redis_url:
            # Log Redis connection info (mask password for security)
            try:
                from urllib.parse import urlparse
                parsed = urlparse(settings.redis_url)
                masked_url = f"{parsed.scheme}://***@{parsed.hostname}:{parsed.port}{parsed.path}"
                LOGGER.info(f"🔧 Redis URL configured: {masked_url}")
            except Exception:
                LOGGER.info("🔧 Redis URL configured (parsing failed)")
            
            try:
                from urllib.parse import urlparse
                from redis.asyncio import Redis
                import redis
                parsed = urlparse(settings.redis_url)
                LOGGER.info("Connecting to Redis using single-node client")
                # Test connection on startup (fail-fast)
                LOGGER.info("Testing Redis connection...")
                test_client = redis.Redis.from_url(
                    settings.redis_url,
                    socket_connect_timeout=10.0,
                    socket_timeout=10.0,
                )
                test_client.ping()
                test_client.close()
                # Create async client for runtime
                self._redis = Redis.from_url(
                    settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=10.0,
                    socket_timeout=10.0,
                )
                LOGGER.info("✅ Redis connected")
            except Exception as e:
                # Log detailed error info
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(settings.redis_url)
                    error_detail = f"host={parsed.hostname}, port={parsed.port}, scheme={parsed.scheme}"
                except Exception:
                    error_detail = "URL parsing failed"
                
                LOGGER.error(f"❌ Redis connection failed ({error_detail}): {e}")
        self.database = PersistenceDatabase(settings.database_url)
        asr_adapter = build_asr_adapter(settings)
        llm_adapter = build_llm_adapter(settings)
        memory_adapter = build_memory_adapter(
            settings,
            database=self.database,
            redis_client=self._redis,
            llm_adapter=llm_adapter,
        )
        tts_adapter = build_tts_adapter(settings)
        self.session_manager = SessionManager(
            asr_adapter=asr_adapter,
            llm_adapter=llm_adapter,
            memory_adapter=memory_adapter,
            tts_adapter=tts_adapter,
            context_window_size=int(settings.context_window_size or 5),
            redis_client=self._redis,
        )
        # Email service for verification and password reset
        self.email_service = EmailService(
            api_key=settings.resend_api_key,
            from_email=settings.from_email,
            verification_template_id=settings.resend_verification_template_id,
            password_reset_template_id=settings.resend_password_reset_template_id,
        )
        self.billing_service = StripeService(
            api_key=settings.stripe_secret_key,
            webhook_secret=settings.stripe_webhook_secret,
            monthly_amount_cents=int(settings.stripe_monthly_amount_cents or 0),
            yearly_amount_cents=int(settings.stripe_yearly_amount_cents or 0),
            currency=settings.billing_currency or "usd",
            self_hosted=settings.self_hosted,
        )
        # Track session → authenticated user ownership
        self._session_owner_lock = asyncio.Lock()
        self._session_owner: dict[str, str] = {}

    # --------- Session ownership ----------
    async def set_session_owner(self, session_id: str, user_id: str) -> None:
        async with self._session_owner_lock:
            self._session_owner[session_id] = user_id

    async def get_session_owner(self, session_id: str) -> str | None:
        async with self._session_owner_lock:
            return self._session_owner.get(session_id)

    async def clear_session_owner(self, session_id: str) -> None:
        async with self._session_owner_lock:
            self._session_owner.pop(session_id, None)


def build_app_state(settings: Settings) -> AppState:
    return AppState(settings)
