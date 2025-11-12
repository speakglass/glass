"""ASR adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .deepgram import DeepgramASRAdapter
from .nvidia import NvidiaNIMASRAdapter
from .null import NullASRAdapter

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
        if provider in {"scribe", "scribe_v2", "elevenlabs"}:
            api_key = getattr(settings, "elevenlabs_api_key", None)
            if not api_key:
                raise ValueError("ElevenLabs API key is required for Scribe ASR.")
            return ElevenLabsScribeASRAdapter(
                api_key=api_key,
                model_id=getattr(settings, "scribe_model_id", "scribe_v2_realtime"),
                language_code=getattr(settings, "scribe_language_code", None),
                audio_format=getattr(settings, "scribe_audio_format", "pcm_16000"),
                sample_rate=getattr(settings, "scribe_sample_rate", 16000),
                commit_strategy=getattr(settings, "scribe_commit_strategy", "vad"),
                vad_silence_threshold=getattr(settings, "scribe_vad_silence_threshold_secs", 1.5),
                vad_threshold=getattr(settings, "scribe_vad_threshold", 0.4),
                min_speech_ms=getattr(settings, "scribe_min_speech_duration_ms", 100),
                min_silence_ms=getattr(settings, "scribe_min_silence_duration_ms", 100),
                endpoint=getattr(
                    settings,
                    "scribe_endpoint",
                    "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
                ),
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
    "ElevenLabsScribeASRAdapter",
]
