"""Diarization adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .noop import NullDiarizationAdapter
from .nvidia import NvidiaNIMDiarizationAdapter

LOGGER = logging.getLogger(__name__)


class DiarizationAdapter(Protocol):
    async def stream(self, session_id: str, audio_iter, *, source: str | None = None): ...


def build_diarization_adapter(settings) -> DiarizationAdapter | None:
    provider = (getattr(settings, "diarization_provider", None) or "null").lower()
    if provider in {"none", "null"}:
        return None
    try:
        if provider in {"nvidia", "nvidia-nim"}:
            api_key = getattr(settings, "nvidia_api_key", None)
            endpoint = getattr(settings, "nvidia_diarization_url", None) or getattr(
                settings, "nvidia_api_url", None
            )
            if not api_key or not endpoint:
                raise ValueError("NVIDIA API key and diarization URL are required.")
            return NvidiaNIMDiarizationAdapter(
                endpoint=endpoint,
                api_key=api_key,
                model=getattr(settings, "nvidia_diarization_model", "nvidia/diar_streaming_sortformer_4spk-v2"),
            )
    except ValueError as exc:
        LOGGER.warning("Falling back to null diarization adapter: %s", exc)
    return NullDiarizationAdapter()


__all__ = [
    "DiarizationAdapter",
    "build_diarization_adapter",
    "NullDiarizationAdapter",
    "NvidiaNIMDiarizationAdapter",
]
