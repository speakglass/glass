from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ..auth.jwt import AuthenticatedUser
from ..domain import prompts
from ..domain.memory import ConversationInsights
from ..persistence.db import AccountConversation, ConversationPartner
from ..domain.ports import LLMPort

LOGGER = logging.getLogger(__name__)


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
        "zh": "Chinese (中文)",
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
            max_tokens=60,
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
        return "Partner" if role == "partner" else "Learner"

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
            max_tokens=200,
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


def _conversation_excerpt(
    messages: list[dict[str, Any]],
    *,
    max_chars: int = 4000,
    max_messages: int = 40,
) -> str:
    """Render a compact transcript for downstream memory prompts."""
    if not messages:
        return ""

    def _label(msg: dict[str, Any]) -> str:
        role = (msg.get("role") or "").lower()
        if role == "user":
            return "Learner"
        if role == "assistant":
            return "Glass"
        if role == "partner":
            return "Partner"
        return "Other"

    lines: list[str] = []
    for msg in messages[-max_messages:]:
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"{_label(msg)}: {text}")

    excerpt = "\n".join(lines)
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[-max_chars:]


def _clean_text(value: Any, *, limit: int | None = None) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if limit and len(cleaned) > limit:
        cleaned = cleaned[:limit].rstrip()
    return cleaned


def _normalize_highlight_list(data: Any, *, max_items: int, limit: int) -> list[str]:
    if not isinstance(data, list):
        return []
    highlights: list[str] = []
    for entry in data:
        text = _clean_text(entry, limit=limit)
        if text:
            highlights.append(text)
        if len(highlights) >= max_items:
            break
    return highlights


def _normalize_conversation_insights(payload: dict[str, Any]) -> ConversationInsights | None:
    user_insights = _normalize_highlight_list(payload.get("user_insights"), max_items=3, limit=200)
    partner_insights = _normalize_highlight_list(payload.get("partner_insights"), max_items=3, limit=200)
    interaction_insights = _normalize_highlight_list(payload.get("interaction_insights"), max_items=3, limit=200)

    if not any([user_insights, partner_insights, interaction_insights]):
        return None

    insights: ConversationInsights = {}
    if user_insights:
        insights["user_insights"] = user_insights
    if partner_insights:
        insights["partner_insights"] = partner_insights
    if interaction_insights:
        insights["interaction_insights"] = interaction_insights
    return insights


async def extract_conversation_memories_with_llm(
    llm_adapter: LLMPort | None,
    messages: list[dict[str, Any]],
    learning_lang: str | None,
    native_lang: str | None,
    partner_label: str | None = None,
) -> ConversationInsights | None:
    """Use LLM to extract durable memories from a finished conversation."""
    if not llm_adapter or not messages:
        return None

    excerpt = _conversation_excerpt(messages)
    if not excerpt:
        return None

    native_name = native_lang or "unknown"
    system_prompt, user_prompt = prompts.build_memory_extraction_prompt(
        conversation_excerpt=excerpt,
        native_lang_name=native_name,
    )
    if partner_label:
        user_prompt += f"\nPartner reference: {partner_label}\n"

    try:
        response = await llm_adapter.call(
            prompt=user_prompt,
            system=system_prompt,
            temperature=0.1,
            max_tokens=900,
            json_mode=True,
        )
    except Exception as exc:
        LOGGER.debug("[MemoryExtraction] LLM call failed: %s", exc)
        return None

    if not response:
        return None

    try:
        data = json.loads(response)
    except Exception as exc:
        LOGGER.debug("[MemoryExtraction] Failed to parse JSON: %s", exc)
        return None

    if not isinstance(data, dict):
        return None

    return _normalize_conversation_insights(data)


def derive_conversation_title(
    extracted_info: list[dict[str, Any]] | None,
    started_at: datetime | None,
) -> str:
    """Fallback title generation when LLM is not available."""
    if extracted_info:
        for item in extracted_info:
            label = (item.get("label") or "").lower()
            if label in {"topic", "event", "meeting", "subject"}:
                value = (item.get("value") or "").strip()
                if value:
                    return value
    if started_at:
        return started_at.strftime("Conversation on %b %d")
    return "Conversation"


def _hydrate_participant_snapshot(
    snapshot: dict[str, Any] | None,
    partner: ConversationPartner | None,
) -> dict[str, Any] | None:
    if not snapshot and not partner:
        return snapshot
    hydrated: dict[str, Any] = dict(snapshot or {})
    partner_snapshot = dict((snapshot or {}).get("partner") or {})
    if partner:
        partner_snapshot.update(
            {
                "id": partner.id,
                "name": partner.name,
                "description": partner.description,
                "avatar_url": partner.avatar_url,
                "voice_id": partner.voice_id,
                "learning_lang": partner.learning_lang,
                "native_lang": partner.native_lang,
                "is_system": partner.user_id is None,
            }
        )
    if partner_snapshot:
        hydrated["partner"] = partner_snapshot
    return hydrated or None


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
        "participant_snapshot": _hydrate_participant_snapshot(convo.participant_snapshot, partner),
    }


def serialize_detail(
    convo: AccountConversation,
    *,
    partner: ConversationPartner | None = None,
    memory_thread_id: str | None = None,
    memory_insights: ConversationInsights | None = None,
) -> dict[str, Any]:
    base = serialize_summary(convo, partner=partner)
    payload: dict[str, Any] = {
        "messages": convo.messages,
        "feedback": convo.feedback,
        "memory_thread_id": memory_thread_id,
    }
    if memory_insights is not None:
        payload["memory_insights"] = memory_insights
    base.update(payload)
    return base
