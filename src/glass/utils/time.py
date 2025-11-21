"""Time utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def to_unix_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def minutes_ago(minutes: int) -> datetime:
    return utc_now() - timedelta(minutes=minutes)


def format_relative_time_compact(timestamp_str: str | datetime | None) -> str:
    """Format timestamp as compact relative time for LLM prompts.

    Args:
        timestamp_str: ISO timestamp string, datetime object, or None

    Returns:
        Compact relative time string (e.g., "3d ago", "2h ago", "now")
    """
    if not timestamp_str:
        return "past"

    try:
        # Parse to datetime if string
        if isinstance(timestamp_str, str):
            normalized = timestamp_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(normalized)
        elif isinstance(timestamp_str, datetime):
            dt = timestamp_str
        else:
            return "past"

        # Ensure timezone-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        delta = now - dt

        # Compact format for prompts
        if delta.days > 0:
            return f"{delta.days}d ago"
        elif delta.seconds >= 3600:
            hours = delta.seconds // 3600
            return f"{hours}h ago"
        else:
            return "now"
    except Exception:
        return "past"
