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
        utterance_end_ms: int | None = None,
    ): ...


def build_asr_adapter(settings) -> ASRAdapter:
    provider = getattr(settings, "asr_provider", "deepgram").lower()

    if provider == "deepgram":
        api_key = getattr(settings, "deepgram_key", None)
        if not api_key:
            raise ValueError("Deepgram API key is required.")
        return DeepgramASRAdapter(  # type: ignore[return-value]
            api_key=api_key,
            utterance_end_ms=getattr(settings, "deepgram_utterance_end_ms", 1000),
            endpointing_ms=getattr(settings, "deepgram_endpointing_ms", None),
            vad_events=getattr(settings, "deepgram_enable_vad_events", True),
        )

    raise ValueError(f"Unknown ASR provider: {provider}")


__all__ = [
    "ASRAdapter",
    "build_asr_adapter",
    "DeepgramASRAdapter",
]
