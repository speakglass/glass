"""TTS adapter selection utilities."""

from __future__ import annotations

import logging

from .elevenlabs import ElevenLabsTTSAdapter

LOGGER = logging.getLogger(__name__)


def build_tts_adapter(settings):
    """Build TTS adapter from settings.
    
    Args:
        settings: Application settings
        
    Returns:
        TTS adapter instance or None if not configured
    """
    provider = getattr(settings, "tts_provider", "elevenlabs").lower()
    
    if provider == "elevenlabs":
        api_key = getattr(settings, "elevenlabs_api_key", None)
        if not api_key:
            LOGGER.info("TTS not configured (no ElevenLabs API key)")
            return None
        
        return ElevenLabsTTSAdapter(
            api_key=api_key,
            model=getattr(settings, "elevenlabs_model", "eleven_flash_v2_5"),
            default_voice_id=getattr(settings, "elevenlabs_voice_id", "cgSgspJ2msm6clMCkdW9"),
            stability=0.5,
            similarity_boost=0.75,
            timeout=30.0,
        )
    
    raise ValueError(f"Unknown TTS provider: {provider}")


__all__ = [
    "ElevenLabsTTSAdapter",
    "build_tts_adapter",
]

