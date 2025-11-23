from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, TypedDict

from fastapi import HTTPException

from ..adapters.memory.extractor import extract_memory_candidates
from ..auth.jwt import AuthenticatedUser
from ..domain import prompts
from ..domain.ports import LLMPort
from ..persistence.db import AccountConversation, ConversationPartner
from ..utils.language import lang_code_to_name

LOGGER = logging.getLogger(__name__)


class MemoryFactPayload(TypedDict, total=False):
    text: str
    summary: str | None
    category: str
    retention: str
    importance: int
    retention_ttl_days: float | int | None
    retention_expires_at: str | None
    partner_id: str | None
    conversation_id: str | None
    scope: str | None
    speaker: str | None
    evidence: str | None


def client_id_for_user(user: AuthenticatedUser) -> str:
    return f"user:{user.user_id}"


async def generate_conversation_title_with_llm(
    llm_adapter: LLMPort | None,
    messages: list[dict[str, Any]],
    native_lang: str | None,
) -> str | None:
    """Generate a conversation title using LLM based on initial messages."""
    if not llm_adapter or not messages:
        return None

    # Get first 5-8 messages for context
    initial_messages = messages[:8]
    if len(initial_messages) < 2:
        return None

    # Format messages for the prompt
    conversation_text = ""

    def _label_for_message(msg: dict[str, Any]) -> str:
        role = (msg.get("role") or "").lower()
        partner_id = (msg.get("partner_id") or "").lower()
        if role == "user":
            return "You"
        if role == "assistant":
            return "Glass"
        if role == "partner":
            return "Partner"
        return "Partner"

    for msg in initial_messages:
        text = msg.get("text", "")
        if text:
            label = _label_for_message(msg)
            conversation_text += f"{label}: {text}\n"

    if not conversation_text.strip():
        return None

    # Map language codes to full names
    language_map = {
        "ko": "Korean (한국어)",
        "en": "English",
        "ja": "Japanese (日本語)",
        "es": "Spanish (Español)",
        "fr": "French (Français)",
    }

    target_language = language_map.get(native_lang or "en", "English")

    # Generate title using LLM
    prompt = f"""Based on the following conversation, generate a short, descriptive title in {target_language}.

Conversation:
{conversation_text}

Rules:
- Create a concise title (2-6 words) that captures the main topic or theme
- Write ONLY in {target_language}
- Be specific and descriptive
- Do NOT use generic phrases like "Conversation" or "Chat"
- Do NOT include quotes or extra formatting
- Output ONLY the title, nothing else

Title:"""

    try:
        title = await llm_adapter.call(
            prompt=prompt,
            temperature=0.5,
            max_tokens=2048,
        )
        title = (title or "").strip().strip('"').strip("'").strip()

        # Validate title length
        if title and 2 <= len(title.split()) <= 10:
            LOGGER.info(f"Generated title: {title}")
            return title
    except Exception as e:
        LOGGER.warning(f"Failed to generate title with LLM: {e}")

    return None


async def extract_partner_profile_with_llm(
    llm_adapter: LLMPort | None,
    messages: list[dict[str, Any]],
    learning_lang: str | None,
    native_lang: str | None,
) -> dict[str, str | None] | None:
    """Infer partner name/description from the conversation using an LLM."""
    if not llm_adapter or not messages:
        return None

    initial_messages = messages[:16]
    lines: list[str] = []

    def _label(role: str) -> str:
        return "Partner" if role == "partner" else "User"

    for msg in initial_messages:
        role = (msg.get("role") or "").lower()
        if role not in {"user", "partner"}:
            continue
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"{_label(role)}: {text}")

    if not lines:
        return None

    conversation_text = "\n".join(lines)
    learning_name = learning_lang or "unknown"
    native_name = native_lang or "unknown"

    prompt = f"""You analyze language tutoring conversations.
The learner's native language is {native_name} and they are practicing {learning_name}.
Inspect the partner's utterances below. If the partner states their name or describes what they do,
capture it. Return valid JSON with keys "name" and "description" (short single sentence).
Use null for any field that isn't explicitly mentioned. Output ONLY JSON.

Conversation snippet:
{conversation_text}

JSON:
"""

    try:
        response = await llm_adapter.call(
            prompt=prompt,
            temperature=0.2,
            max_tokens=4096,
        )
        if not response:
            return None
        data = json.loads(response)
        if isinstance(data, dict):
            name = data.get("name")
            description = data.get("description")
            return {
                "name": name.strip() if isinstance(name, str) and name.strip() else None,
                "description": description.strip() if isinstance(description, str) and description.strip() else None,
            }
    except Exception as exc:
        LOGGER.debug(f"Failed to extract partner profile via LLM: {exc}")
        return None
    return None


async def build_memory_entries_with_llm(
    llm_adapter: LLMPort | None,
    messages: list[dict[str, Any]],
    native_language: str | None = None,
    partner_label: str | None = None,
    *,
    partner_id: str | None = None,
    existing_memories: list[str] | None = None,
) -> list[MemoryFactPayload]:
    """Extract conversational facts in a classifier-compatible format."""
    if not llm_adapter or not messages:
        return []

    try:
        native_language_name = lang_code_to_name(native_language) if native_language else None
        candidates = await extract_memory_candidates(
            llm=llm_adapter,
            messages=messages,
            native_language_name=native_language_name,
            partner_label=partner_label,
            existing_memories=existing_memories or [],
        )
    except Exception as exc:
        LOGGER.debug("[MemoryExtraction] Candidate extraction failed: %s", exc)
        return []

    entries: list[MemoryFactPayload] = []
    for candidate in candidates:
        entry: MemoryFactPayload = {
            "text": candidate.text,
            "scope": candidate.scope,
            "speaker": candidate.speaker,
        }
        if candidate.evidence:
            entry["evidence"] = candidate.evidence
        entries.append(entry)

    return entries


def derive_conversation_title(started_at: datetime | None) -> str:
    """Fallback title generation when LLM is not available."""
    if started_at:
        return started_at.strftime("Conversation on %b %d")
    return "Conversation"


def _serialize_partner(partner: ConversationPartner | None) -> dict[str, Any] | None:
    if not partner:
        return None
    return {
        "id": partner.id,
        "name": partner.name,
        "description": partner.description,
        "avatar_url": partner.avatar_url,
        "voice_id": partner.voice_id,
        "learning_lang": partner.learning_lang,
        "native_lang": partner.native_lang,
        "kind": partner.kind,
    }


def _serialize_feedback_entries(entries: list[Any] | None) -> list[dict[str, Any]]:
    """Serialize message-level feedback records for API responses."""
    if not entries:
        return []
    serialized: list[dict[str, Any]] = []
    for entry in entries:
        if not entry:
            continue
        message = getattr(entry, "message", None)
        serialized.append(
            {
                "message_id": getattr(entry, "message_id", None),
                "utterance_id": getattr(message, "utterance_id", None) if message else None,
                "text": getattr(entry, "explanation", None),
                "suggested_text": getattr(entry, "suggested_text", None),
                "original_text": getattr(entry, "original_text", None),
                "feedback_type": getattr(entry, "feedback_type", None),
                "severity": getattr(entry, "severity", None),
                "is_overall": getattr(entry, "is_overall", False),
                "span_start": getattr(entry, "span_start", None),
                "span_end": getattr(entry, "span_end", None),
            }
        )
    return serialized


def serialize_summary(
    convo: AccountConversation,
    *,
    partner: ConversationPartner | None = None,
) -> dict[str, Any]:
    return {
        "id": convo.id,
        "session_id": convo.session_id,
        "title": convo.title,
        "summary": convo.summary,
        "started_at": convo.started_at,
        "ended_at": convo.ended_at,
        "duration_seconds": convo.duration_seconds,
        "learning_lang": convo.learning_lang,
        "native_lang": convo.native_lang,
        "scores": convo.scores,
        "partner_id": convo.partner_id,
        "partner": _serialize_partner(partner),
    }


def serialize_detail(
    convo: AccountConversation,
    *,
    partner: ConversationPartner | None = None,
    memories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    base = serialize_summary(convo, partner=partner)
    payload: dict[str, Any] = {
        "messages": convo.messages,
        "feedback": convo.feedback,
        "memories": memories or [],
        "feedback_items": _serialize_feedback_entries(getattr(convo, "feedback_entries", None)),
    }
    base.update(payload)
    return base
