"""LLM-backed classification helpers for conversational memories."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from ...domain.ports import LLMPort
from ...utils.language import lang_code_to_name

LOGGER = logging.getLogger(__name__)

VALID_CATEGORIES = {"fact", "preference", "skill", "context", "rule"}
VALID_RETENTIONS = {"short_term", "long_term", "permanent"}

LLM_SYSTEM_PROMPT = """
You are Glass Memory — classify durable conversational facts.

Output JSON with keys:
{
  "category": "fact|preference|skill|context|rule",
  "retention": "short_term|long_term|permanent",
  "importance": 0-100,
  "summary": "<optional headline>",
  "keywords": ["..."],
  "entities": [{"label": "...", "value": "..."}],
  "expires_in_days": null or positive number
}

Guidelines:
- Use short_term only when the information clearly expires within a week; otherwise long_term or permanent.
- importance indicates how helpful the fact is for personalization.
- keywords/entities should be concise anchors for retrieval.
"""


@dataclass(slots=True)
class MemoryClassification:
    category: str
    retention: str
    importance: int
    expires_at: datetime | None
    keywords: list[str]
    entities: list[dict[str, str]]
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

    summary_lang_instruction = ""
    if native_language:
        lang_name = lang_code_to_name(native_language)
        summary_lang_instruction = (
            f"The user's native language is {lang_name}. "
            "Write the `summary` field using this language even if the memory text is in another language."
        )

    language_block = f"{summary_lang_instruction.strip()}\n\n" if summary_lang_instruction else ""

    prompt = (
        f"Scope: {scope or 'user'}\n"
        f"Memory text:\n{normalized}\n\n"
        f"{language_block}"
        "Respond with JSON only."
    )
    response = await llm.call(
        prompt=prompt,
        system=LLM_SYSTEM_PROMPT,
        temperature=0.1,
        max_tokens=400,
        json_mode=True,
    )
    if not response:
        raise RuntimeError("LLM returned empty response for memory classification")

    try:
        payload = json.loads(response)
    except Exception as exc:
        LOGGER.error("[MemoryClassifier] Invalid JSON response: %s", exc)
        raise

    if not isinstance(payload, dict):
        raise RuntimeError("LLM response must be a JSON object")

    category = _coerce_choice(payload.get("category"), VALID_CATEGORIES, default="fact")
    retention = _coerce_choice(payload.get("retention"), VALID_RETENTIONS, default="long_term")
    importance = _coerce_int(payload.get("importance"), default=75, minimum=0, maximum=100)
    summary = _coerce_str(payload.get("summary"))

    expires_at = _coerce_expiration(payload.get("expires_in_days"))
    keywords = _coerce_str_list(payload.get("keywords"), limit=20)
    entities = _coerce_entity_list(payload.get("entities"), limit=20)
    content_hash = hashlib.sha1(f"{user_id}:{normalized.lower()}".encode("utf-8"), usedforsecurity=False).hexdigest()

    return MemoryClassification(
        category=category,
        retention=retention,
        importance=importance,
        expires_at=expires_at,
        keywords=keywords,
        entities=entities,
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


def _coerce_str_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    results: list[str] = []
    for entry in value:
        if isinstance(entry, str):
            text = entry.strip()
            if text:
                results.append(text)
        if len(results) >= limit:
            break
    return results


def _coerce_entity_list(value: Any, *, limit: int) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    entities: list[dict[str, str]] = []
    for entry in value:
        if isinstance(entry, dict):
            label = str(entry.get("label") or "keyword").strip() or "keyword"
            val = str(entry.get("value") or "").strip()
            if val:
                entities.append({"label": label, "value": val})
        elif isinstance(entry, str):
            val = entry.strip()
            if val:
                entities.append({"label": "keyword", "value": val})
        if len(entities) >= limit:
            break
    return entities
