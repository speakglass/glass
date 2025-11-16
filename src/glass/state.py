"""Application state containers."""

from __future__ import annotations

import asyncio
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta

from .adapters.asr import build_asr_adapter
from .adapters.websocket import NullEventsAdapter
from .adapters.llm import build_llm_adapter
from .adapters.memory import build_memory_adapter
from .adapters.tts import build_tts_adapter
from .config import Settings
from .domain.session import ConversationSession
from .services.email import EmailService

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
    ) -> None:
        self.asr_adapter = asr_adapter
        self.llm_adapter = llm_adapter
        self.memory_adapter = memory_adapter
        self.tts_adapter = tts_adapter
        self.context_window_size = context_window_size
        self._pipelines: dict[str, ConversationSession] = {}
        self._lock = asyncio.Lock()

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

    @staticmethod
    def new_session_id() -> str:
        return uuid.uuid4().hex


class AppState:
    """Container for core app singletons."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # Enforce Redis when daily quota is enabled
        if settings.daily_free_minutes is not None and not settings.redis_url:
            raise ValueError(
                "GLASS_DAILY_FREE_MINUTES is set but GLASS_REDIS_URL is not configured. "
                "Please provide GLASS_REDIS_URL or set GLASS_DAILY_FREE_MINUTES=None to disable the feature."
            )
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
                if settings.daily_free_minutes is not None:
                    raise RuntimeError(
                        f"Redis required for daily quota but connection failed: {e}\n"
                        f"Connection details: {error_detail}\n"
                        f"Check: Redis URL, firewall, and port accessibility"
                    )
        asr_adapter = build_asr_adapter(settings)
        llm_adapter = build_llm_adapter(settings)
        memory_adapter = build_memory_adapter(settings)
        tts_adapter = build_tts_adapter(settings)
        self.session_manager = SessionManager(
            asr_adapter=asr_adapter,
            llm_adapter=llm_adapter,
            memory_adapter=memory_adapter,
            tts_adapter=tts_adapter,
            context_window_size=int(settings.context_window_size or 5),
        )
        # Email service for verification and password reset
        self.email_service = EmailService(
            api_key=settings.resend_api_key,
            from_email=settings.from_email,
            verification_template_id=settings.resend_verification_template_id,
            password_reset_template_id=settings.resend_password_reset_template_id,
        )
        # In-memory fallback for daily usage (used if Redis temporarily fails)
        # key: client_id, value: (date_str_utc, used_seconds)
        self._fallback_daily_usage: dict[str, tuple[str, int]] = {}
        # Error logging throttle (avoid spamming logs on Redis failures)
        self._last_redis_error_log: dict[str, float] = {}  # method_name -> last_log_time
        self._redis_error_log_interval = 60.0  # Log once per minute
        # Track session → authenticated user ownership
        self._session_owner_lock = asyncio.Lock()
        self._session_owner: dict[str, str] = {}

    # Removed per-day session cap logic

    def _should_log_redis_error(self, method_name: str) -> bool:
        """Check if we should log Redis error (throttle to avoid spam)."""
        now = time.time()
        last_log = self._last_redis_error_log.get(method_name, 0)
        if now - last_log >= self._redis_error_log_interval:
            self._last_redis_error_log[method_name] = now
            return True
        return False

    # --------- Daily quota tracking (shared across sessions) ----------
    def has_quota_tracking(self) -> bool:
        """True if daily quota tracking is enabled and Redis is configured."""
        return self.settings.daily_free_minutes is not None and self._redis is not None

    # --------- Daily cumulative usage (resets every UTC midnight) ----------
    def _today_str_utc(self) -> str:
        now = datetime.now(timezone.utc)
        return now.strftime("%Y%m%d")

    def _seconds_until_utc_midnight(self) -> int:
        now = datetime.now(timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return max(1, int((tomorrow - now).total_seconds()))

    async def get_used_seconds_today(self, client_id: str) -> int:
        """Return seconds used today for this client (UTC day). Ensures key is initialized with TTL.

        Requires Redis when feature is enabled; uses in-proc fallback on transient errors.
        """
        if not self.has_quota_tracking():
            # With quota disabled, treat as 0 used (unlimited)
            return 0
        date_str = self._today_str_utc()
        key = f"glass:usage:{client_id}:{date_str}"
        try:
            # Initialize key with TTL to next midnight if missing
            if not await self._redis.exists(key):  # type: ignore[union-attr]
                await self._redis.set(key, 0, ex=self._seconds_until_utc_midnight(), nx=True)  # type: ignore[union-attr]
            val = await self._redis.get(key)  # type: ignore[union-attr]
            used = max(0, int(val or 0))
            # Ensure key has TTL; if not, set it
            ttl = await self._redis.ttl(key)  # type: ignore[union-attr]
            if ttl is not None and ttl < 0:
                await self._redis.expire(key, self._seconds_until_utc_midnight())  # type: ignore[union-attr]
            # Cache fallback
            self._fallback_daily_usage[client_id] = (date_str, used)
            return used
        except Exception as e:
            if self._should_log_redis_error("get_used_seconds_today"):
                LOGGER.warning("[Budget] get_used_seconds_today Redis error: %s; using fallback (logging throttled to 1/min)", e)
            cached = self._fallback_daily_usage.get(client_id)
            if cached is None or cached[0] != date_str:
                # New day or no cache → reset fallback
                self._fallback_daily_usage[client_id] = (date_str, 0)
                return 0
            return int(cached[1])

    async def incr_used_seconds(self, client_id: str, seconds: int = 1) -> int:
        """Increment seconds used today and return updated used total (UTC day)."""
        seconds = max(1, int(seconds))
        if not self.has_quota_tracking():
            # If quota disabled, do nothing and return 0 used (unlimited)
            return 0
        date_str = self._today_str_utc()
        key = f"glass:usage:{client_id}:{date_str}"
        try:
            # Ensure key exists with TTL to midnight
            if not await self._redis.exists(key):  # type: ignore[union-attr]
                await self._redis.set(key, 0, ex=self._seconds_until_utc_midnight(), nx=True)  # type: ignore[union-attr]
            used = await self._redis.incrby(key, seconds)  # type: ignore[union-attr]
            # Ensure expiry is still present
            ttl = await self._redis.ttl(key)  # type: ignore[union-attr]
            if ttl is not None and ttl < 0:
                await self._redis.expire(key, self._seconds_until_utc_midnight())  # type: ignore[union-attr]
            # Cache fallback
            self._fallback_daily_usage[client_id] = (date_str, int(used))
            return int(used)
        except Exception as e:
            if self._should_log_redis_error("incr_used_seconds"):
                LOGGER.warning("[Budget] incr_used_seconds Redis error: %s; using fallback (logging throttled to 1/min)", e)
            cached = self._fallback_daily_usage.get(client_id)
            if cached is None or cached[0] != date_str:
                new_used = seconds
            else:
                new_used = int(cached[1]) + seconds
            self._fallback_daily_usage[client_id] = (date_str, new_used)
            return new_used

    async def get_remaining_seconds_quota(self, client_id: str, bonus_minutes: int | None = None) -> int:
        """Return remaining seconds available today for this client.
        
        Logic:
        - If daily_free_minutes is None: Return None (unlimited)
        - Otherwise: Return daily remaining + bonus remaining
        
        Args:
            client_id: User's client ID
            bonus_minutes: User's bonus minutes from account (if any)
        
        Returns:
            Remaining seconds, or a very large number if unlimited
        """
        if self.settings.daily_free_minutes is None:
            # Unlimited usage
            return 999999999  # Very large number to indicate unlimited
        
        # Calculate daily remaining
        daily_total = max(0, int(self.settings.daily_free_minutes) * 60)
        used = await self.get_used_seconds_today(client_id)
        daily_remaining = max(0, daily_total - used)
        
        # If still has daily quota, return it
        if daily_remaining > 0:
            return daily_remaining
        
        # Daily quota exhausted, check bonus
        if bonus_minutes is not None and bonus_minutes > 0:
            bonus_seconds = max(0, int(bonus_minutes) * 60)
            # How much over daily quota?
            over_daily = used - daily_total
            bonus_remaining = max(0, bonus_seconds - over_daily)
            return bonus_remaining
        
        # No quota left
        return 0

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
