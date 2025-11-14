"""ASR adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .deepgram import DeepgramASRAdapter

LOGGER = logging.getLogger(__name__)


class ASRAdapter(Protocol):
    async def stream(
        self,
        session_id: str,
        audio_iter,
        *,
        source: str | None = None,
        language: str | None = None,
        model: str | None = None,
    ): ...

def build_asr_adapter(settings) -> ASRAdapter:
    provider = getattr(settings, "asr_provider", "deepgram").lower()
    
    if provider == "deepgram":
        api_key = getattr(settings, "deepgram_key", None)
        if not api_key:
            raise ValueError("Deepgram API key is required.")
        return DeepgramASRAdapter(
            api_key=api_key,
            model=getattr(settings, "deepgram_model", "nova-3"),
            language=getattr(settings, "deepgram_language", "en"),
            encoding=getattr(settings, "deepgram_encoding", "linear16"),
            sample_rate=getattr(settings, "deepgram_sample_rate", 16000),
            interim_results=getattr(settings, "deepgram_interim_results", True),
            utterance_end_ms=getattr(settings, "deepgram_utterance_end_ms", 3500),
            endpointing_ms=getattr(settings, "deepgram_endpointing_ms", 2500),
        )
    
    raise ValueError(f"Unknown ASR provider: {provider}")


__all__ = [
    "ASRAdapter",
    "build_asr_adapter",
    "DeepgramASRAdapter",
]
