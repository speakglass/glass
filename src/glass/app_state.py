"""Application state containers."""

from __future__ import annotations

import asyncio
import time
import uuid

from .adapters.asr import build_asr_adapter
from .adapters.diarization import build_diarization_adapter
from .adapters.events_ws import NullEventsAdapter
from .adapters.llm import build_llm_adapter
from .adapters.memory import build_memory_adapter
from .adapters.vision import build_vision_adapter
from .config import Settings
from .domain.pipeline import SessionPipeline


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
                self._redis = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        except Exception:
            self._redis = None
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
        # Minimal in-memory usage tracking (per-client unique sessions)
        self._usage_lock = asyncio.Lock()
        # Tracks per-client unique session ids for the current UTC day
        # { client_id: { 'day': 'YYYY-MM-DD', 'sids': set([...]) } }
        self._client_usage: dict[str, dict[str, object]] = {}
        # Guard to avoid multiple budget decrement watchers per client (per-process)
        self._budget_watchers_lock = asyncio.Lock()
        self._budget_watchers: set[str] = set()

    async def record_session_and_check_limit(self, client_id: str, session_id: str) -> tuple[bool, int]:
        """Record unique session for client for the current UTC day.

        Returns (allowed, remaining_for_today). Duplicate session_id does not re-count.
        Resets counts automatically when the UTC day changes.
        """
        # If disabled
        if self.settings.max_sessions_per_client is None:
            return True, 0

        limit = int(self.settings.max_sessions_per_client or 0)
        current_day = time.strftime("%Y-%m-%d", time.gmtime())
        async with self._usage_lock:
            entry = self._client_usage.get(client_id)
            if entry is None or entry.get("day") != current_day:
                entry = {"day": current_day, "sids": set()}
                self._client_usage[client_id] = entry
            sids = entry["sids"]  # type: ignore[assignment]
            # mypy: sids is a set[str]
            if isinstance(sids, set):
                if session_id in sids:
                    remaining = max(0, limit - len(sids))
                    return True, remaining
                if len(sids) >= limit:
                    return False, 0
                sids.add(session_id)
                remaining = max(0, limit - len(sids))
                return True, remaining
            # Fallback safeguard
            self._client_usage[client_id] = {"day": current_day, "sids": {session_id}}
            remaining = max(0, limit - 1)
            return True, remaining

    # --------- Time budget (shared across sessions) ----------
    def has_budget_store(self) -> bool:
        """True if time budget is enabled and Redis is configured."""
        return self.settings.free_minutes_per_user is not None and self._redis is not None

    async def get_remaining_seconds(self, client_id: str) -> int:
        """Return remaining free-usage seconds for a client from Redis; initializes if missing.
        If budget is disabled or Redis not configured, returns a large sentinel.
        """
        if not self.has_budget_store():
            return 10**12
        default_seconds = max(0, int(self.settings.free_minutes_per_user or 0) * 60)
        try:
            key = f"glass:budget:{client_id}"
            val = await self._redis.get(key)  # type: ignore[operator]
            if val is None:
                await self._redis.set(key, default_seconds)  # type: ignore[operator]
                return default_seconds
            return max(0, int(val))
        except Exception:
            # If Redis errors, fail-safe to large sentinel so we don't block users
            return 10**12

    async def decrement_seconds(self, client_id: str, seconds: int = 1) -> int:
        """Atomically decrement remaining seconds in Redis. Returns remaining (>=0).
        If budget disabled or Redis is unavailable, returns a large sentinel.
        """
        if not self.has_budget_store():
            return 10**12
        seconds = max(1, int(seconds))
        try:
            key = f"glass:budget:{client_id}"
            # Initialize if missing
            if await self._redis.get(key) is None:  # type: ignore[operator]
                await self._redis.set(key, max(0, int(self.settings.free_minutes_per_user or 0) * 60))  # type: ignore[operator]
            remaining = await self._redis.decrby(key, seconds)  # type: ignore[attr-defined]
            if remaining is None:
                return 0
            if remaining < 0:
                await self._redis.set(key, 0)  # type: ignore[operator]
                return 0
            return int(remaining)
        except Exception:
            # Fail-safe to large sentinel to avoid hard-blocking on Redis errors
            return 10**12

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
