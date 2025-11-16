"""ElevenLabs TTS adapter."""

from __future__ import annotations

import logging
from typing import AsyncIterable

import httpx

LOGGER = logging.getLogger(__name__)


class ElevenLabsTTSAdapter:
    """ElevenLabs text-to-speech adapter."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "eleven_flash_v2_5",
        default_voice_id: str = "cgSgspJ2msm6clMCkdW9",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        timeout: float = 30.0,
    ) -> None:
        """Initialize ElevenLabs TTS adapter.
        
        Args:
            api_key: ElevenLabs API key
            model: Model ID to use
            default_voice_id: Default voice ID
            stability: Voice stability (0-1)
            similarity_boost: Voice similarity boost (0-1)
            timeout: Request timeout in seconds
        """
        if not api_key:
            msg = "ElevenLabs API key is required."
            raise ValueError(msg)
        
        self.api_key = api_key
        self.model = model
        self.default_voice_id = default_voice_id
        self.stability = stability
        self.similarity_boost = similarity_boost
        self.timeout = timeout

    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        language: str | None = None,
    ) -> AsyncIterable[bytes]:
        """Stream synthesized audio from ElevenLabs.
        
        Args:
            text: Text to synthesize
            voice_id: Voice ID (uses default if None)
            language: Language code (not used by ElevenLabs, voice determines language)
            
        Yields:
            Audio data chunks (MP3 format)
        """
        voice = voice_id or self.default_voice_id
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream"
        
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        
        payload = {
            "text": text,
            "model_id": self.model,
            "voice_settings": {
                "stability": self.stability,
                "similarity_boost": self.similarity_boost,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }
        
        LOGGER.info(f"[ElevenLabs] Synthesizing text: {text[:50]}...")
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        LOGGER.error(f"[ElevenLabs] API error: {error_text.decode()}")
                        return
                    
                    async for chunk in response.aiter_bytes(chunk_size=4096):
                        if chunk:
                            yield chunk
            
            LOGGER.info("[ElevenLabs] Synthesis completed")
        
        except Exception as e:
            LOGGER.error(f"[ElevenLabs] Synthesis failed: {e}", exc_info=True)
            return

