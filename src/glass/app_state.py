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


def build_app_state(settings: Settings) -> AppState:
    return AppState(settings)
