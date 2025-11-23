"""Text-to-speech synthesis for text-to-speech synthesis."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, AsyncIterable

if TYPE_CHECKING:
    from .ports import TTSPort, TTSStreamChunk

LOGGER = logging.getLogger(__name__)


class SpeechSynthesis:
    """Handle text-to-speech synthesis with voice selection."""

    def __init__(
        self,
        session_id: str,
        tts: TTSPort,
        *,
        default_voice_id: str | None = None,
        ai_voice_id: str | None = None,
    ):
        self.session_id = session_id
        self.tts = tts
        self.default_voice_id = default_voice_id
        self.ai_voice_id = ai_voice_id
        
        # Voice mapping by language (optional customization)
        self.voice_map: dict[str, str] = {}

    def set_voice_for_language(self, language: str, voice_id: str) -> None:
        """Set specific voice for a language."""
        self.voice_map[language] = voice_id
        LOGGER.info(f"[TTS] Set voice for {language}: {voice_id}")

    def get_voice_for_language(self, language: str, source: str = "user") -> str | None:
        """Get appropriate voice ID for language and source.
        
        Args:
            language: Language code (e.g., 'en', 'ko')
            source: Message source ('user', 'ai', 'glass', etc.)
            
        Returns:
            Voice ID or None (uses TTS adapter default)
        """
        # AI source uses AI voice if configured
        if source == "ai" and self.ai_voice_id:
            return self.ai_voice_id
        
        # Check language-specific mapping
        if language in self.voice_map:
            return self.voice_map[language]
        
        # Use default voice
        return self.default_voice_id

    async def synthesize_stream(
        self,
        text: str,
        *,
        language: str | None = None,
        source: str = "user",
        voice_id: str | None = None,
    ) -> AsyncIterable["TTSStreamChunk"]:
        """Stream synthesized audio.
        
        Args:
            text: Text to synthesize
            language: Language code for voice selection
            source: Message source for voice selection
            voice_id: Explicit voice ID (overrides auto-selection)
            
        Yields:
            Audio data chunks
        """
        try:
            # Select voice (explicit > auto-select > None)
            if voice_id is None and language:
                voice_id = self.get_voice_for_language(language, source)
            
            LOGGER.info(
                f"[TTS] Synthesizing: text='{text[:50]}...', "
                f"lang={language}, voice={voice_id}, source={source}"
            )
            
            # Stream from TTS adapter
            async for chunk in self.tts.synthesize_stream(
                text,
                voice_id=voice_id,
                language=language,
            ):
                if chunk:
                    yield chunk
            
            LOGGER.info("[TTS] Synthesis completed")
        
        except Exception as e:
            LOGGER.error(f"[TTS] Synthesis failed: {e}", exc_info=True)
            return
