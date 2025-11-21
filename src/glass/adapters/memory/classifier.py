"""LLM-backed classification helpers for conversational memories."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from ...domain.ports import LLMPort
from ...schemas import MemoryClassificationResponse
from ...utils.language import lang_code_to_name

LOGGER = logging.getLogger(__name__)

VALID_CATEGORIES = {"fact", "preference", "skill", "context", "rule"}
VALID_RETENTIONS = {"short_term", "long_term", "permanent"}

LLM_SYSTEM_PROMPT = """
You are Glass Memory — classify durable conversational facts.

Guidelines:
- Use short_term only when the information clearly expires within a week; otherwise long_term or permanent.
- importance indicates how helpful the fact is for personalization (0-100).
"""


@dataclass(slots=True)
class MemoryClassification:
    category: str
    retention: str
    importance: int
    expires_at: datetime | None
    content_hash: str
    summary: str | None = None


async def classify_memory(
    *,
    llm: LLMPort,
    user_id: str,
    text: str,
    scope: str | None = None,
    native_language: str | None = None,
) -> MemoryClassification:
    """Classify the given fact using the configured LLM."""
    normalized = " ".join((text or "").strip().split())
    if not normalized:
        raise ValueError("Memory text cannot be empty")

    # Build prompt and schema context
    prompt = f"Scope: {scope or 'user'}\n" f"Memory text:\n{normalized}"

    schema_context = None
    if native_language:
        lang_name = lang_code_to_name(native_language)
        schema_context = {"NATIVE": lang_name}

    LOGGER.info(f"[Memory Classification] SYSTEM:\n{LLM_SYSTEM_PROMPT}\n\nUSER:\n{prompt}")

    response = await llm.call(
        prompt=prompt,
        system=LLM_SYSTEM_PROMPT,
        temperature=0.1,
        response_schema=MemoryClassificationResponse,
        schema_context=schema_context,
    )

    if not isinstance(response, dict):
        raise RuntimeError("LLM returned invalid response for memory classification")

    payload = response

    category = _coerce_choice(payload.get("category"), VALID_CATEGORIES, default="fact")
    retention = _coerce_choice(payload.get("retention"), VALID_RETENTIONS, default="long_term")
    importance = _coerce_int(payload.get("importance"), default=75, minimum=0, maximum=100)
    summary = _coerce_str(payload.get("summary"))

    expires_at = _coerce_expiration(payload.get("expires_in_days"))
    content_hash = hashlib.sha1(f"{user_id}:{normalized.lower()}".encode("utf-8"), usedforsecurity=False).hexdigest()

    return MemoryClassification(
        category=category,
        retention=retention,
        importance=importance,
        expires_at=expires_at,
        content_hash=content_hash,
        summary=summary,
    )


def _coerce_choice(value: Any, valid: set[str], default: str) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in valid:
            return lowered
    return default


def _coerce_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        numeric = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, numeric))


def _coerce_str(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _coerce_expiration(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        days = float(value)
    except (TypeError, ValueError):
        return None
    if days <= 0:
        return None
    return datetime.now(timezone.utc) + timedelta(days=days)
