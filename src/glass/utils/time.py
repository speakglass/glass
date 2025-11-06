"""Time utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def to_unix_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def minutes_ago(minutes: int) -> datetime:
    return utc_now() - timedelta(minutes=minutes)
