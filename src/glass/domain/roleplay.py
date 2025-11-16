"""AI roleplay for roleplay mode AI interactions."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any

from . import prompts
from ..utils.language import lang_code_to_name

if TYPE_CHECKING:
    from .ports import LLMPort

LOGGER = logging.getLogger(__name__)


class Roleplay:
    """Handle AI roleplay in roleplay mode."""

    def __init__(
        self,
        session_id: str,
        llm: LLMPort,
        emit_callback,
    ):
        self.session_id = session_id
        self.llm = llm
        self._emit = emit_callback
        
        # Configuration
        self.contact_name: str | None = None
        self.contact_description: str | None = None
        self.contact_voice_id: str | None = None
        self.contact_id: str | None = None
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"
        
        # Track feedback for context
        self.recent_feedback: list[str] = []
        self._translations: dict[str, str] = {}

    def add_feedback(self, feedback_text: str) -> None:
        """Add feedback to recent context (max 3)."""
        self.recent_feedback.append(feedback_text)
        if len(self.recent_feedback) > 3:
            self.recent_feedback.pop(0)

    async def generate_ai_response(
        self,
        user_text: str,
        *,
        recent_conversation: list[dict],
        user_context: str = "",
        thread_context: str = "",
    ) -> str:
        """Generate AI conversation partner response.
        
        Args:
            user_text: User's message
            recent_conversation: Recent conversation history
            user_context: User-level context
            thread_context: Thread-level context
            
        Returns:
            AI response text
        """
        try:
            LOGGER.info("[Roleplay] Generating response")
            
            target_lang = lang_code_to_name(self.learning_lang)
            native_lang = lang_code_to_name(self.native_lang)
            
            # Get recent feedback for context
            recent_feedback = "\n".join(self.recent_feedback) if self.recent_feedback else None
            
            # Build prompt
            recent_conv_texts = [msg.get("text", "") for msg in recent_conversation]
            system_prompt, user_prompt = prompts.build_ai_response_prompt(
                user_text=user_text,
                contact_name=self.contact_name,
                contact_description=self.contact_description,
                target_lang=target_lang,
                native_lang=native_lang,
                recent_conversation=recent_conv_texts,
                recent_feedback=recent_feedback,
                user_context=user_context,
                thread_context=thread_context,
            )
            
            # Generate response
            ai_response = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.8,
                max_tokens=300,
            )
            
            if not ai_response or not ai_response.strip():
                return ""
            
            LOGGER.info(f"[Roleplay] Generated: {ai_response[:50]}...")
            return ai_response.strip()
        
        except Exception as e:
            LOGGER.error(f"[Roleplay] Failed to generate response: {e}", exc_info=True)
            return ""

    async def emit_ai_turn(
        self,
        user_text: str,
        user_utterance_id: str,
        event_type_transcript,
        event_type_translation,
        *,
        recent_conversation: list[dict],
        user_context: str = "",
        thread_context: str = "",
        user_message_end_time: float | None = None,
    ) -> dict | None:
        """Generate and emit AI conversation turn.
        
        Args:
            user_text: User's message
            user_utterance_id: User's utterance ID
            event_type_transcript: Transcript event type
            event_type_translation: Translation event type
            recent_conversation: Recent conversation history
            user_context: User-level context
            thread_context: Thread-level context
            user_message_end_time: When user finished speaking
            
        Returns:
            AI message dict for storage, or None if failed
        """
        # Generate AI response
        ai_response = await self.generate_ai_response(
            user_text,
            recent_conversation=recent_conversation,
            user_context=user_context,
            thread_context=thread_context,
        )
        
        if not ai_response:
            return None
        
        ai_utterance_id = str(uuid.uuid4())
        
        # Calculate timing (AI responds shortly after user)
        ai_start_time = user_message_end_time + 0.5 if user_message_end_time is not None else 0.0
        ai_duration = len(ai_response) * 0.05  # ~0.05s per character
        
        # Emit AI transcript with TTS flag and voice_id
        await self._emit(
            event_type_transcript,
            {
                "utterance_id": ai_utterance_id,
                "text": ai_response,
                "is_final": True,
                "speech_final": True,
                "lang": self.learning_lang,
                "auto_tts": True,  # Signal for automatic TTS
                "voice_id": self.contact_voice_id,  # Include voice_id for TTS
                "start": ai_start_time,
                "duration": ai_duration,
            },
            source="ai",
        )
        
        # Translate AI response
        ai_translation = None
        try:
            native_lang_name = lang_code_to_name(self.native_lang)
            target_lang_name = lang_code_to_name(self.learning_lang)
            
            system_prompt, user_prompt = prompts.build_translation_prompt(
                ai_response, target_lang_name, native_lang_name
            )
            ai_translation = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.3,
            )
            
            if ai_translation:
                await self._emit(
                    event_type_translation,
                    {
                        "utterance_id": ai_utterance_id,
                        "text": ai_translation,
                        "source_lang": self.learning_lang,
                        "target_lang": self.native_lang,
                    },
                    source="ai",
                )
                self._translations[ai_utterance_id] = ai_translation
        except Exception as e:
            LOGGER.warning(f"[Roleplay] Translation failed: {e}")
        
        LOGGER.info(f"[Roleplay] Completed turn for {user_utterance_id}")
        
        # Return message for storage
        return {
            "text": ai_response,
            "utterance_id": ai_utterance_id,
            "translation": ai_translation,
            "language": self.learning_lang,
        }
