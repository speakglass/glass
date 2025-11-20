"""LLM-backed extraction helpers for conversational memories."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Sequence

from ...domain.ports import LLMPort
from ...schemas import MemoryExtractionResponse

LOGGER = logging.getLogger(__name__)


LLM_MEMORY_EXTRACTOR_PROMPT = """
You are Glass Memory. Extract durable facts from tutoring conversations.

Guidelines:
- Extract ONLY information explicitly stated in the conversation transcript below.
- Do NOT include or infer facts from partner metadata (name is provided for reference only).
- Use scope=user for user facts, partner for partner's information revealed in conversation, interaction for shared commitments/plans.
- Highlight stable preferences, skills, routines, goals. Ignore greetings or temporary feelings.
- Limit to the 8 most relevant facts and avoid duplicates or anything already present in existing_memories.
- Keep statements short for downstream classification.
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
        if lowered == "user":
            return "user"
        if lowered == "partner":
            return "partner"
        if lowered == "interaction":
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
    native_language_name: str | None = None,
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

    # Build structured prompt
    prompt_parts = [
        "# Context (for reference only - do NOT extract facts from here)",
        f"Partner name: {partner_label or 'Unknown'}",
        f"Existing memories: {', '.join(existing_memories or ['None'])}",
        "",
        "# Conversation Transcript (extract facts from here)",
        "Recent conversation turns:",
        *[f"{turn['role'].title()}: {turn['text']}" for turn in turns[:10]],
        "",
        "Full excerpt:",
        excerpt,
    ]
    prompt = "\n".join(prompt_parts)

    try:
        # Build schema context with native language
        schema_context = None
        if native_language_name:
            schema_context = {"NATIVE": native_language_name}

        LOGGER.info(f"[Memory Extraction] SYSTEM:\n{LLM_MEMORY_EXTRACTOR_PROMPT}\n\nUSER:\n{prompt}")

        response = await llm.call(
            prompt=prompt,
            system=LLM_MEMORY_EXTRACTOR_PROMPT,
            temperature=0.1,
            response_schema=MemoryExtractionResponse,
            schema_context=schema_context,
        )
    except Exception as exc:
        LOGGER.debug("[MemoryExtractor] LLM call failed: %s", exc)
        return []

    if not isinstance(response, dict):
        return []

    facts = response.get("facts", [])
    if not isinstance(facts, list):
        return []

    candidates: list[MemoryExtractionCandidate] = []
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        text = _clean_text(fact.get("text"))
        if not text:
            continue
        speaker = _normalize_speaker(fact.get("speaker"))
        scope = _normalize_scope(fact.get("scope"), speaker=speaker)
        if not scope:
            continue
        evidence = _clean_text(fact.get("evidence"))
        candidates.append(MemoryExtractionCandidate(text=text, scope=scope, speaker=speaker, evidence=evidence))
        if len(candidates) >= 8:
            break

    return candidates
