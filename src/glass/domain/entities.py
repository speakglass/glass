"""Domain entities for the Glass core."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from ..utils.time import utc_now


class EventType(str, Enum):
    """Event types for session communication."""

    # Public realtime transcript events
    TRANSCRIPT_INTERIM = "transcript_interim"
    TRANSCRIPT_FINAL = "transcript_final"
    UTTERANCE_COMPLETED = "utterance_completed"

    # Product events
    TRANSLATION = "translation"
    FEEDBACK = "feedback"
    SUGGESTION = "suggestion"
    ERROR = "error"


@dataclass(slots=True)
class SessionEvent:
    """Event that flows through the conversation session."""

    type: EventType
    session_id: str
    payload: dict
    sequence: int | None = None
    created_at: datetime = field(default_factory=utc_now)
