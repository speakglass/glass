"""Domain entities for the Glass core."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from ..utils.time import utc_now


class EventType(str, Enum):
    """Event types for session communication."""
    AUDIO_CHUNK = "audio_chunk"
    PARTIAL_TRANSCRIPT = "partial_transcript"
    TRANSCRIPT = "transcript"
    TRANSLATION = "translation"
    FEEDBACK = "feedback"
    SUGGESTION = "suggestion"
    ERROR = "error"
    UTTERANCE_END = "utterance_end"


@dataclass(slots=True)
class SessionEvent:
    """Event that flows through the conversation session."""

    type: EventType
    session_id: str
    payload: dict
    sequence: int | None = None
    created_at: datetime = field(default_factory=utc_now)
