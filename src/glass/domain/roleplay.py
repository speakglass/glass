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
        self.partner_name: str | None = None
        self.partner_description: str | None = None
        self.partner_voice_id: str | None = None
        self.partner_id: str | None = None
        self.user_name: str | None = None
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"
        
        self._translations: dict[str, str] = {}

    def set_user_name(self, name: str | None) -> None:
        self.user_name = name.strip() if isinstance(name, str) and name.strip() else None

    async def generate_ai_response(
        self,
        user_text: str,
        *,
        recent_conversation: list[dict],
        thread_context: str = "",
        interaction_context: str = "",
    ) -> str:
        """Generate AI conversation partner response.
        
        Args:
            user_text: User's message
            recent_conversation: Recent conversation history
            thread_context: Partner-specific history/notes from past interactions
            
        Returns:
            AI response text
        """
        try:
            LOGGER.info("[Roleplay] Generating response")
            
            target_lang = lang_code_to_name(self.learning_lang)
            native_lang = lang_code_to_name(self.native_lang)
            
            # Build prompt
            recent_conv_texts: list[str] = []
            for message in recent_conversation[-6:]:
                role = (message.get("role") or "partner").lower()
                if role == "user":
                    speaker = "User"
                    name = self.user_name
                else:
                    speaker = "You"
                    name = self.partner_name
                text = (message.get("text") or "").strip()
                if not text:
                    continue
                label = f"{speaker} ({name})" if name else speaker
                recent_conv_texts.append(f"{label}: {text}")
            if not recent_conv_texts:
                recent_conv_texts = ["(No recent conversation yet)"]
            system_prompt, user_prompt = prompts.build_ai_response_prompt(
                user_text=user_text,
                partner_name=self.partner_name,
                partner_description=self.partner_description,
                target_lang=target_lang,
                native_lang=native_lang,
                recent_conversation=recent_conv_texts,
                thread_context=thread_context,
                interaction_context=interaction_context or None,
                user_name=self.user_name,
            )
            LOGGER.debug(
                "[RoleplayPrompt]\nSYSTEM:\n%s\n\nUSER:\n%s",
                system_prompt,
                user_prompt,
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
        thread_context: str = "",
        interaction_context: str = "",
        user_message_end_time: float | None = None,
    ) -> dict | None:
        """Generate and emit AI conversation turn.
        
        Args:
            user_text: User's message
            user_utterance_id: User's utterance ID
            event_type_transcript: Transcript event type
            event_type_translation: Translation event type
            recent_conversation: Recent conversation history
            thread_context: Partner-specific context/history
            user_message_end_time: When user finished speaking
            
        Returns:
            AI message dict for storage, or None if failed
        """
        # Generate AI response
        ai_response = await self.generate_ai_response(
            user_text,
            recent_conversation=recent_conversation,
            thread_context=thread_context,
            interaction_context=interaction_context,
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
                "voice_id": self.partner_voice_id,  # Include voice_id for TTS
                "start": ai_start_time,
                "duration": ai_duration,
                "end": ai_start_time + ai_duration,
                "audio_cursor": ai_start_time + ai_duration,
                "latency_ms": 0,
                "completed_by": "speech_final",
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
