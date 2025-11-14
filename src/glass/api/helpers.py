from __future__ import annotations

from datetime import datetime
from typing import Any
import logging

from fastapi import HTTPException

from ..auth.jwt import AuthenticatedUser
from ..persistence.db import AccountConversation
from ..domain.ports import LLMPort

LOGGER = logging.getLogger(__name__)


def client_id_for_user(user: AuthenticatedUser) -> str:
    return f"user:{user.user_id}"


async def ensure_session_owner(app_state, session_id: str, user: AuthenticatedUser) -> None:
    owner = await app_state.get_session_owner(session_id)
    if owner and owner != user.user_id:
        raise HTTPException(status_code=403, detail="Session belongs to another user")
    await app_state.set_session_owner(session_id, user.user_id)


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
    for msg in initial_messages:
        speaker = msg.get("speaker", "unknown")
        text = msg.get("text", "")
        if text:
            label = "You" if speaker == "user" else "Partner"
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
        title = await llm_adapter.generate_text(prompt, max_tokens=50)
        title = title.strip().strip('"').strip("'").strip()
        
        # Validate title length
        if title and 2 <= len(title.split()) <= 10:
            LOGGER.info(f"Generated title: {title}")
            return title
    except Exception as e:
        LOGGER.warning(f"Failed to generate title with LLM: {e}")
    
    return None


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


def serialize_summary(convo: AccountConversation) -> dict[str, Any]:
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
    }


def serialize_detail(convo: AccountConversation) -> dict[str, Any]:
    base = serialize_summary(convo)
    base.update(
        {
            "messages": convo.messages,
            "feedback": convo.feedback,
        }
    )
    return base


async def save_extracted_memories(
    db,
    user_id: str,
    conversation_id: str,
    extracted_info: list[dict[str, Any]],
) -> None:
    """DEPRECATED: Save extracted information as memory entries.
    
    This function is no longer used. Memory extraction is now handled by Zep.
    Kept for backward compatibility only.
    """
    import warnings
    warnings.warn(
        "save_extracted_memories is deprecated. Memory extraction is handled by Zep.",
        DeprecationWarning,
        stacklevel=2,
    )
    # No-op: Zep handles memory extraction and storage
    return
