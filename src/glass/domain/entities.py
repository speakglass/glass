"""Domain entities for the Glass core."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Sequence


def utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(tz=timezone.utc)


class EventType(str, Enum):
    AUDIO_CHUNK = "audio_chunk"
    PARTIAL_TRANSCRIPT = "partial_transcript"
    TRANSCRIPT = "transcript"
    TRANSLATION = "translation"
    FEEDBACK = "feedback"
    SUGGESTION = "suggestion"
    NOTE = "note"
    ERROR = "error"
    SPEAKER_ACTIVITY = "speaker_activity"
    SPEECH_STARTED = "speech_started"
    UTTERANCE_END = "utterance_end"


@dataclass(slots=True)
class SessionEvent:
    """Canonical event that flows through the session pipeline."""

    type: EventType
    session_id: str
    payload: dict
    sequence: int | None = None
    created_at: datetime = field(default_factory=utcnow)


@dataclass(slots=True)
class Utterance:
    session_id: str
    text: str
    role: Literal["user", "assistant"] = "user"
    speaker: str | None = None
    language: str | None = None
    timestamp: datetime = field(default_factory=utcnow)


@dataclass(slots=True)
class Suggestion:
    session_id: str
    text: str
    tone: str = "neutral"
    timestamp: datetime = field(default_factory=utcnow)


@dataclass(slots=True)
class Note:
    session_id: str
    text: str
    tags: Sequence[str] = field(default_factory=tuple)
    timestamp: datetime = field(default_factory=utcnow)


@dataclass(slots=True)
class ScreenHint:
    session_id: str
    text: str
    app: str | None = None
    timestamp: datetime = field(default_factory=utcnow)


@dataclass(slots=True)
class ImageReference:
    session_id: str
    blob_id: str
    mime_type: str
    timestamp: datetime = field(default_factory=utcnow)
