"""Application state containers."""

from __future__ import annotations

import asyncio
import time
import uuid
import logging

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
        full_conversation_cap: int = 400,
        tail_size: int = 20,
    ) -> None:
        self.asr_adapter = asr_adapter
        self.llm_adapter = llm_adapter
        self.memory_adapter = memory_adapter
        self.vision_adapter = vision_adapter
        self.diarizer_adapter = diarizer_adapter
        self.full_conversation_cap = full_conversation_cap
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
                    full_conversation_cap=self.full_conversation_cap,
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
        self._redis = None  # Optional redis client
        try:
            if settings.redis_url:
                # Lazy import; optional dependency
                from redis.asyncio import Redis  # type: ignore
                # Add socket timeouts to avoid hangs on connect/read
                self._redis = Redis.from_url(
                    settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5.0,
                    socket_timeout=5.0,
                )
        except Exception as e:
            self._redis = None

        # Strict fail if time budget is enabled but Redis client is unavailable
        if settings.free_minutes_per_user is not None and self._redis is None:
            raise RuntimeError(
                "GLASS_FREE_MINUTES_PER_USER is set, but Redis client is unavailable. "
                "Ensure redis>=5 is installed and GLASS_REDIS_URL is a valid, reachable URL (e.g., rediss://...:6380/0), "
                "or disable GLASS_FREE_MINUTES_PER_USER."
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
            full_conversation_cap=int(settings.max_full_conversation or 0),
            tail_size=int(settings.tail_size or 20),
        )
        # Guard to avoid multiple budget decrement watchers per client (per-process)
        self._budget_watchers_lock = asyncio.Lock()
        self._budget_watchers: set[str] = set()
        # In-memory fallback remaining seconds per client (used if Redis temporarily fails)
        self._fallback_remaining: dict[str, int] = {}
        # In-memory fallback deadline (epoch seconds) per client for deadline-based budget
        self._fallback_end_at: dict[str, int] = {}

    # Removed per-day session cap logic

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
            LOGGER.warning("[Budget] get_or_init_end_at Redis error: %s; using fallback", e)
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
            LOGGER.warning("[Budget] get_remaining_seconds Redis error: %s; using fallback", e)
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
            LOGGER.warning("[Budget] decrement_seconds Redis error: %s; using fallback", e)
            current = int(self._fallback_remaining.get(client_id, default_seconds))
            current = max(0, current - seconds)
            self._fallback_remaining[client_id] = current
            return current

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
