"""LLM-backed extraction helpers for conversational memories."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Sequence

from ...domain.ports import LLMPort

LOGGER = logging.getLogger(__name__)


LLM_MEMORY_EXTRACTOR_PROMPT = """
You are Glass Memory. Extract durable facts from bilingual tutoring conversations.

Input JSON has:
{
  "learning_language": "...",
  "native_language": "...",
  "partner_name": "...",
  "recent_turns": [{"role": "user|partner", "text": "..."}],
  "conversation_excerpt": "...",
  "existing_memories": ["..."]
}

Return STRICT JSON with key "facts": an array of objects containing:
- "text": concise statement exactly as spoken (no translation)
- "scope": "user" | "partner" | "interaction"
- "speaker": "user" | "partner" (who said it)
- "evidence": optional short quote or justification

Guidelines:
- Surface only information explicitly stated or reaffirmed in the transcript.
- Use scope=user for learner facts, partner for the tutor's information, interaction for shared commitments/plans.
- Highlight stable preferences, skills, routines, goals. Ignore greetings or temporary feelings.
- Limit to the 8 most relevant facts and avoid duplicates or anything already present in existing_memories.
- Keep statements short for downstream classification. Output JSON only.
""".strip()


@dataclass(slots=True)
class MemoryExtractionCandidate:
    text: str
    scope: str
    speaker: str | None = None
    evidence: str | None = None


def _clean_text(value: Any, *, limit: int | None = None) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if limit is not None and len(cleaned) > limit:
        return cleaned[:limit].rstrip()
    return cleaned


def _normalize_scope(value: Any, *, speaker: str | None = None) -> str | None:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"user", "learner"}:
            return "user"
        if lowered in {"partner", "tutor", "teacher"}:
            return "partner"
        if lowered in {"interaction", "relationship", "thread", "session"}:
            return "interaction"
    if speaker in {"user", "partner"}:
        return speaker
    return None


def _normalize_speaker(value: Any) -> str | None:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"user", "partner"}:
            return lowered
    return None


def _filter_dialog_turns(messages: Sequence[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not messages:
        return []
    turns: list[dict[str, Any]] = []
    for msg in messages:
        role = (msg.get("role") or "partner").strip().lower()
        if role not in {"user", "partner"}:
            continue
        text = _clean_text(msg.get("text"))
        if not text:
            continue
        turns.append({"role": role, "text": text})
    return turns


def _conversation_excerpt(messages: Sequence[dict[str, Any]], *, max_chars: int = 4000, max_messages: int = 40) -> str:
    turns = _filter_dialog_turns(messages)
    if not turns:
        return ""
    lines = [f"{turn['role'].title()}: {turn['text']}" for turn in turns[-max_messages:]]
    excerpt = "\n".join(lines)
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[-max_chars:]


async def extract_memory_candidates(
    *,
    llm: LLMPort | None,
    messages: list[dict[str, Any]],
    learning_language: str | None,
    native_language: str | None,
    partner_label: str | None = None,
    existing_memories: Sequence[str] | None = None,
) -> list[MemoryExtractionCandidate]:
    """Extract memory candidates from a conversation transcript."""
    if not llm or not messages:
        return []

    turns = _filter_dialog_turns(messages)[-40:]
    excerpt = _conversation_excerpt(messages, max_chars=6000, max_messages=60)
    if not turns and not excerpt:
        return []

    payload = {
        "learning_language": learning_language or "",
        "native_language": native_language or "",
        "partner_name": partner_label or "",
        "recent_turns": turns,
        "conversation_excerpt": excerpt,
        "existing_memories": list(existing_memories or []),
    }

    prompt = json.dumps(payload, ensure_ascii=False)
    try:
        response = await llm.call(
            prompt=prompt,
            system=LLM_MEMORY_EXTRACTOR_PROMPT,
            temperature=0.1,
            max_tokens=600,
            json_mode=True,
        )
    except Exception as exc:
        LOGGER.debug("[MemoryExtractor] LLM call failed: %s", exc)
        return []

    if not response:
        return []

    try:
        data = json.loads(response)
    except Exception as exc:
        LOGGER.debug("[MemoryExtractor] Invalid JSON: %s", exc)
        return []

    facts = data.get("facts") or data.get("entries") or data.get("memories")
    if not isinstance(facts, list):
        return []

    candidates: list[MemoryExtractionCandidate] = []
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        text = _clean_text(fact.get("text") or fact.get("statement") or fact.get("value"))
        if not text:
            continue
        speaker = _normalize_speaker(fact.get("speaker") or fact.get("role"))
        scope = _normalize_scope(fact.get("scope") or fact.get("subject"), speaker=speaker)
        if not scope:
            continue
        evidence = _clean_text(fact.get("evidence") or fact.get("quote"))
        candidates.append(MemoryExtractionCandidate(text=text, scope=scope, speaker=speaker, evidence=evidence))
        if len(candidates) >= 8:
            break

    return candidates
