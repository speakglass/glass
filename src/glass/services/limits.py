"""Helpers for enforcing per-account storage limits."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..config import Settings


@dataclass(frozen=True)
class ConversationLimitStatus:
    """Represents the current state of the conversation quota for a user."""

    enabled: bool
    limit: int | None
    used: int
    remaining: int | None
    blocked: bool


def conversation_limit_status(
    settings: Settings,
    billing_payload: dict[str, Any] | None,
    *,
    used: int,
) -> ConversationLimitStatus:
    """Return the user's conversation limit status based on settings and billing state."""

    limit_value = int(getattr(settings, "free_tier_conversation_limit", 0) or 0)
    if limit_value <= 0:
        return ConversationLimitStatus(False, None, used, None, False)

    payload = billing_payload or {}
    if payload.get("self_hosted"):
        return ConversationLimitStatus(False, None, used, None, False)
    if payload.get("active"):
        return ConversationLimitStatus(False, None, used, None, False)

    remaining = max(limit_value - used, 0)
    blocked = used >= limit_value
    return ConversationLimitStatus(
        True,
        limit=limit_value,
        used=used,
        remaining=remaining,
        blocked=blocked,
    )
