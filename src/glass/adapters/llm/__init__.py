"""LLM adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .gemini import GeminiLLMAdapter
from .openai import OpenAILLMAdapter

LOGGER = logging.getLogger(__name__)


class LLMAdapter(Protocol):
    async def call(
        self,
        prompt: str | list[dict] | None = None,
        *,
        messages: list[dict] | None = None,
        system: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_schema: object | None = None,
        schema_context: dict[str, str] | None = None,
    ) -> str | dict: ...


def build_llm_adapter(settings) -> LLMAdapter:
    """Build LLM adapter from settings.

    The adapter uses the configured default model (openai_model) for most operations,
    and can be overridden per-call if needed (e.g., openai_analysis_model).
    """
    provider = (getattr(settings, "llm_provider", None) or "openai").lower()
    if provider == "openai":
        api_key = getattr(settings, "openai_api_key", None)
        if not api_key:
            raise ValueError("OpenAI API key is required.")
        return OpenAILLMAdapter(  # type: ignore[return-value]
            api_key=api_key,
            model=getattr(settings, "openai_model", "gpt-4.1-mini"),
            base_url=getattr(settings, "openai_base_url", "https://api.openai.com/v1"),
            timeout=getattr(settings, "openai_timeout", 15.0),
        )
    if provider == "gemini":
        api_key = getattr(settings, "gemini_api_key", None)
        if not api_key:
            raise ValueError("Gemini API key is required.")
        return GeminiLLMAdapter(  # type: ignore[return-value]
            api_key=api_key,
            model=getattr(settings, "gemini_model", "gemini-2.5-flash"),
            base_url=getattr(settings, "gemini_base_url", "https://generativelanguage.googleapis.com/v1beta/models"),
            timeout=getattr(settings, "gemini_timeout", 15.0),
        )
    raise ValueError(f"Unknown LLM provider: {provider}")


__all__ = [
    "LLMAdapter",
    "build_llm_adapter",
    "GeminiLLMAdapter",
    "OpenAILLMAdapter",
]
