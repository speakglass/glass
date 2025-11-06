"""Vision adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .noop import NullVisionAdapter
from .openai import OpenAIVisionAdapter

LOGGER = logging.getLogger(__name__)


class VisionAdapter(Protocol):
    async def describe(self, session_id: str, image_ref: dict) -> str: ...


def build_vision_adapter(settings) -> VisionAdapter:
    provider = (getattr(settings, "vision_provider", None) or "null").lower()
    try:
        if provider in {"openai", "gpt"}:
            api_key = getattr(settings, "openai_api_key", None)
            if not api_key:
                raise ValueError("OpenAI API key is required for vision.")
            return OpenAIVisionAdapter(
                api_key=api_key,
                model=getattr(settings, "openai_vision_model", getattr(settings, "openai_model", "gpt-4.1-mini")),
                base_url=getattr(settings, "openai_base_url", "https://api.openai.com/v1"),
                timeout=getattr(settings, "openai_timeout", 15.0),
            )
    except ValueError as exc:
        LOGGER.warning("Falling back to null vision adapter: %s", exc)
    return NullVisionAdapter()


__all__ = [
    "VisionAdapter",
    "build_vision_adapter",
    "NullVisionAdapter",
    "OpenAIVisionAdapter",
]
