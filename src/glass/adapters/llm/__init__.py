"""LLM adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .openai import OpenAILLMAdapter

LOGGER = logging.getLogger(__name__)


class LLMAdapter(Protocol):
    async def suggest(self, transcript_tail: list[str | dict], screen, memory, tone, lang): ...


def build_llm_adapter(settings) -> LLMAdapter:
    provider = (getattr(settings, "llm_provider", None) or "openai").lower()
    if provider == "openai":
        api_key = getattr(settings, "openai_api_key", None)
        if not api_key:
            raise ValueError("OpenAI API key is required.")
        return OpenAILLMAdapter(
            api_key=api_key,
            model=getattr(settings, "openai_model", "gpt-4.1-mini"),
            base_url=getattr(settings, "openai_base_url", "https://api.openai.com/v1"),
            timeout=getattr(settings, "openai_timeout", 15.0),
            role=getattr(settings, "openai_role", "progress"),
        )
    raise ValueError(f"Unknown LLM provider: {provider}")


__all__ = [
    "LLMAdapter",
    "build_llm_adapter",
    "OpenAILLMAdapter",
]
