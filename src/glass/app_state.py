"""Application state containers."""

from __future__ import annotations

import asyncio
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta

from .adapters.asr import build_asr_adapter
from .adapters.diarization import build_diarization_adapter
from .adapters.events_ws import NullEventsAdapter
from .adapters.llm import build_llm_adapter
from .adapters.memory import build_memory_adapter
from .adapters.vision import build_vision_adapter
from .config import Settings
from .domain.pipeline import SessionPipeline

LOGGER = logging.getLogger(__name__)    

class SessionManager:
    """Registry for session pipelines."""

    def __init__(
        self,
        *,
        asr_adapter,
        llm_adapter,
        memory_adapter,
        vision_adapter=None,
        diarizer_adapter=None,
        tail_size: int = 20,
    ) -> None:
        self.asr_adapter = asr_adapter
        self.llm_adapter = llm_adapter
        self.memory_adapter = memory_adapter
        self.vision_adapter = vision_adapter
        self.diarizer_adapter = diarizer_adapter
        self.tail_size = tail_size
        self._pipelines: dict[str, SessionPipeline] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, session_id: str, events_port=None) -> SessionPipeline:
        async with self._lock:
            pipeline = self._pipelines.get(session_id)
            if pipeline is None:
                pipeline = SessionPipeline(
                    session_id,
                    asr=self.asr_adapter,
                    llm=self.llm_adapter,
                    memory=self.memory_adapter,
                    events=events_port or NullEventsAdapter(),
                    vision=self.vision_adapter,
                    diarizer=self.diarizer_adapter,
                    tail_size=self.tail_size,
                )
                self._pipelines[session_id] = pipeline
            else:
                if events_port is not None:
                    pipeline.attach_events(events_port)
            return pipeline

    @staticmethod
    def new_session_id() -> str:
        return uuid.uuid4().hex


class AppState:
    """Container for core app singletons."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # Enforce Redis when time budget is enabled
        if settings.free_minutes_per_user is not None and not settings.redis_url:
            raise ValueError(
                "GLASS_FREE_MINUTES_PER_USER is set but GLASS_REDIS_URL is not configured. "
                "Please provide GLASS_REDIS_URL or set GLASS_FREE_MINUTES_PER_USER=None to disable the feature."
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
                # Decide cluster vs single-node:
                # 1) Respect explicit flag
                # 2) Auto-detect Azure OSSCluster by common ports (10000+)
                auto_cluster = parsed.port in {10000, 10001, 10002}
                use_cluster = settings.redis_cluster if settings.redis_cluster is not None else auto_cluster
                client_kind = "cluster" if use_cluster else "single-node"
                LOGGER.info(f"Connecting to Redis using {client_kind} client")
                # Test connection on startup (fail-fast) using the appropriate client
                LOGGER.info("Testing Redis connection...")
                if use_cluster:
                    from redis.cluster import RedisCluster as SyncRedisCluster
                    test_client = SyncRedisCluster.from_url(
                        settings.redis_url,
                        decode_responses=True,
                        socket_connect_timeout=10.0,
                        socket_timeout=10.0,
                    )
                    test_client.ping()
                    test_client.close()
                    from redis.asyncio.cluster import RedisCluster as AsyncRedisCluster
                    self._redis = AsyncRedisCluster.from_url(
                        settings.redis_url,
                        decode_responses=True,
                        socket_connect_timeout=10.0,
                        socket_timeout=10.0,
                    )
                else:
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
                if settings.free_minutes_per_user is not None:
                    raise RuntimeError(
                        f"Redis required for time budget but connection failed: {e}\n"
                        f"Connection details: {error_detail}\n"
                        f"Check: Redis URL, firewall, and port (Azure Managed Redis uses 10000)"
                    )
        asr_adapter = build_asr_adapter(settings)
        llm_adapter = build_llm_adapter(settings)
        memory_adapter = build_memory_adapter(settings)
        vision_adapter = build_vision_adapter(settings)
        diarizer_adapter = build_diarization_adapter(settings)
        self.session_manager = SessionManager(
            asr_adapter=asr_adapter,
            llm_adapter=llm_adapter,
            memory_adapter=memory_adapter,
            vision_adapter=vision_adapter,
            diarizer_adapter=diarizer_adapter,
            tail_size=int(settings.tail_size or 20),
        )
        # Guard to avoid multiple budget decrement watchers per client (per-process)
        self._budget_watchers_lock = asyncio.Lock()
        self._budget_watchers: set[str] = set()
        # In-memory fallback remaining seconds per client (used if Redis temporarily fails)
        self._fallback_remaining: dict[str, int] = {}
        # In-memory fallback deadline (epoch seconds) per client for deadline-based budget
        self._fallback_end_at: dict[str, int] = {}
        # In-memory fallback for daily usage (used if Redis temporarily fails)
        # key: client_id, value: (date_str_utc, used_seconds)
        self._fallback_daily_usage: dict[str, tuple[str, int]] = {}
        # Error logging throttle (avoid spamming logs on Redis failures)
        self._last_redis_error_log: dict[str, float] = {}  # method_name -> last_log_time
        self._redis_error_log_interval = 60.0  # Log once per minute

    # Removed per-day session cap logic

    def _should_log_redis_error(self, method_name: str) -> bool:
        """Check if we should log Redis error (throttle to avoid spam)."""
        now = time.time()
        last_log = self._last_redis_error_log.get(method_name, 0)
        if now - last_log >= self._redis_error_log_interval:
            self._last_redis_error_log[method_name] = now
            return True
        return False

    # --------- Time budget (shared across sessions) ----------
    def has_budget_store(self) -> bool:
        """True if time budget is enabled and Redis is configured."""
        return self.settings.free_minutes_per_user is not None and self._redis is not None

    # --------- Deadline-based budget helpers (no per-second decrement) ----------
    async def get_or_init_end_at(self, client_id: str) -> int:
        """Return per-client deadline (epoch seconds). Initialize if missing.

        Uses Redis SETNX semantics; falls back to in-memory storage if Redis fails.
        """
        default_seconds = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        now = int(time.time())
        if not self.has_budget_store():
            end_at = self._fallback_end_at.get(client_id)
            if end_at is None:
                end_at = now + default_seconds
                self._fallback_end_at[client_id] = end_at
            return end_at
        try:
            key = f"glass:budget:{client_id}:end_at"
            end_at_val = await self._redis.get(key)  # type: ignore[operator]
            if end_at_val is None:
                # Attempt to initialize; race-safe via NX
                desired = now + default_seconds
                await self._redis.set(key, desired, nx=True)  # type: ignore[operator]
                end_at_val = await self._redis.get(key)  # type: ignore[operator]
                if end_at_val is None:
                    end_at_val = desired
            end_at = int(end_at_val)
            # Cache fallback
            self._fallback_end_at[client_id] = end_at
            return end_at
        except Exception as e:
            if self._should_log_redis_error("get_or_init_end_at"):
                LOGGER.warning("[Budget] get_or_init_end_at Redis error: %s; using fallback (logging throttled to 1/min)", e)
            end_at = self._fallback_end_at.get(client_id)
            if end_at is None:
                end_at = now + default_seconds
                self._fallback_end_at[client_id] = end_at
            return end_at

    async def get_remaining_seconds_deadline(self, client_id: str) -> int:
        """Compute remaining seconds from stored deadline; never returns sentinel."""
        end_at = await self.get_or_init_end_at(client_id)
        now = int(time.time())
        return max(0, int(end_at - now))

    async def get_remaining_seconds(self, client_id: str) -> int:
        """Return remaining free-usage seconds; never return sentinel values.

        - If budget disabled, return full allowance (no special handling upstream).
        - If Redis errors, return last known fallback or full allowance.
        """
        default_seconds = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        if not self.has_budget_store():
            return default_seconds
        try:
            key = f"glass:budget:{client_id}"
            val = await self._redis.get(key)  # type: ignore[operator]
            if val is None:
                await self._redis.set(key, default_seconds)  # type: ignore[operator]
                self._fallback_remaining[client_id] = default_seconds
                return default_seconds
            remaining = max(0, int(val))
            self._fallback_remaining[client_id] = remaining
            return remaining
        except Exception as e:
            if self._should_log_redis_error("get_remaining_seconds"):
                LOGGER.warning("[Budget] get_remaining_seconds Redis error: %s; using fallback (logging throttled to 1/min)", e)
            return int(self._fallback_remaining.get(client_id, default_seconds))

    async def decrement_seconds(self, client_id: str, seconds: int = 1) -> int:
        """Atomically decrement remaining seconds; clamp >= 0; no sentinel values.

        - If budget disabled, return full allowance.
        - On Redis error, use in-memory fallback decrement.
        """
        default_seconds = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        if not self.has_budget_store():
            return default_seconds
        seconds = max(1, int(seconds))
        try:
            key = f"glass:budget:{client_id}"
            # Initialize if missing
            if await self._redis.get(key) is None:  # type: ignore[operator]
                await self._redis.set(key, default_seconds)  # type: ignore[operator]
                self._fallback_remaining[client_id] = default_seconds
            remaining = await self._redis.decrby(key, seconds)  # type: ignore[attr-defined]
            if remaining is None:
                remaining_val = 0
            elif remaining < 0:
                await self._redis.set(key, 0)  # type: ignore[operator]
                remaining_val = 0
            else:
                remaining_val = int(remaining)
            self._fallback_remaining[client_id] = remaining_val
            return remaining_val
        except Exception as e:
            if self._should_log_redis_error("decrement_seconds"):
                LOGGER.warning("[Budget] decrement_seconds Redis error: %s; using fallback (logging throttled to 1/min)", e)
            current = int(self._fallback_remaining.get(client_id, default_seconds))
            current = max(0, current - seconds)
            self._fallback_remaining[client_id] = current
            return current

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
        total_allowance = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        if not self.has_budget_store():
            # With budget disabled, treat as 0 used so upstream returns full allowance
            return 0
        date_str = self._today_str_utc()
        key = f"glass:usage:{client_id}:{date_str}"
        try:
            # Initialize key with TTL to next midnight if missing
            if not await self._redis.exists(key):  # type: ignore[operator]
                await self._redis.set(key, 0, ex=self._seconds_until_utc_midnight(), nx=True)  # type: ignore[operator]
            val = await self._redis.get(key)  # type: ignore[operator]
            used = max(0, int(val or 0))
            # Ensure key has TTL; if not, set it
            ttl = await self._redis.ttl(key)  # type: ignore[operator]
            if ttl is not None and ttl < 0:
                await self._redis.expire(key, self._seconds_until_utc_midnight())  # type: ignore[operator]
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
        if not self.has_budget_store():
            # If budget disabled, do nothing and return 0 used
            return 0
        date_str = self._today_str_utc()
        key = f"glass:usage:{client_id}:{date_str}"
        try:
            # Ensure key exists with TTL to midnight
            if not await self._redis.exists(key):  # type: ignore[operator]
                await self._redis.set(key, 0, ex=self._seconds_until_utc_midnight(), nx=True)  # type: ignore[operator]
            used = await self._redis.incrby(key, seconds)  # type: ignore[operator]
            # Ensure expiry is still present
            ttl = await self._redis.ttl(key)  # type: ignore[operator]
            if ttl is not None and ttl < 0:
                await self._redis.expire(key, self._seconds_until_utc_midnight())  # type: ignore[operator]
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

    async def get_remaining_seconds_quota(self, client_id: str) -> int:
        """Return remaining seconds available today for this client (UTC day)."""
        total = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        used = await self.get_used_seconds_today(client_id)
        return max(0, total - used)

    # --------- Budget watcher guard (per-process) ----------
    async def acquire_budget_watcher(self, client_id: str) -> bool:
        async with self._budget_watchers_lock:
            if client_id in self._budget_watchers:
                return False
            self._budget_watchers.add(client_id)
            return True

    async def release_budget_watcher(self, client_id: str) -> None:
        async with self._budget_watchers_lock:
            self._budget_watchers.discard(client_id)


def build_app_state(settings: Settings) -> AppState:
    return AppState(settings)
