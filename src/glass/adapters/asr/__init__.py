"""ASR adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .deepgram import DeepgramASRAdapter
from .nvidia import NvidiaNIMASRAdapter
from .null import NullASRAdapter

LOGGER = logging.getLogger(__name__)


class ASRAdapter(Protocol):
    async def stream(self, session_id: str, audio_iter, *, source: str | None = None): ...


def build_asr_adapter(settings) -> ASRAdapter:
    provider = (getattr(settings, "asr_provider", None) or "null").lower()
    try:
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
        if provider in {"nvidia", "nvidia-nim"}:
            api_key = getattr(settings, "nvidia_api_key", None)
            endpoint = getattr(settings, "nvidia_api_url", None)
            if not api_key or not endpoint:
                raise ValueError("NVIDIA API key and URL are required.")
            return NvidiaNIMASRAdapter(
                endpoint=endpoint,
                api_key=api_key,
                model=getattr(settings, "nvidia_asr_model", "nvidia/parakeet-tdt-0.6b-v3"),
                language=getattr(settings, "nvidia_language", "en-US"),
                diarize=getattr(settings, "nvidia_diarization", True),
                speaker_count=getattr(settings, "nvidia_max_speakers", 4),
            )
    except ValueError as exc:
        LOGGER.warning("Falling back to Null ASR adapter: %s", exc)
    return NullASRAdapter()


__all__ = [
    "ASRAdapter",
    "build_asr_adapter",
    "DeepgramASRAdapter",
    "NvidiaNIMASRAdapter",
    "NullASRAdapter",
]
