from __future__ import annotations

import logging
from collections.abc import Iterable

import httpx

LOGGER = logging.getLogger(__name__)


class GeminiLLMAdapter:
    """Google Gemini API adapter."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gemini-2.5-flash",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta/models",
        timeout: float = 15.0,
    ) -> None:
        if not api_key:
            msg = "Gemini API key is required."
            raise ValueError(msg)
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def call(
        self,
        prompt: str | list[dict] | None = None,
        *,
        messages: list[dict] | None = None,
        system: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        json_mode: bool = False,
    ) -> str:
        chosen_model = model or self.model

        if not prompt and not messages:
            LOGGER.error("Either 'prompt' or 'messages' must be provided")
            return ""

        contents = self._build_contents(prompt=prompt, messages=messages)
        if not contents:
            LOGGER.error("Failed to build Gemini contents payload")
            return ""

        generation_config: dict[str, object] = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
        if json_mode:
            generation_config["responseMimeType"] = "application/json"

        payload: dict[str, object] = {
            "contents": contents,
            "generationConfig": generation_config,
        }
        if system:
            payload["system_instruction"] = {
                "parts": [{"text": system}],
            }

        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                response = await client.post(
                    f"/{chosen_model}:generateContent",
                    params={"key": self.api_key},
                    json=payload,
                )
                if response.status_code != 200:
                    LOGGER.error(
                        "Gemini API error [%s]: %s",
                        response.status_code,
                        response.text,
                    )
                    LOGGER.debug("Request payload: %s", payload)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            LOGGER.error("Gemini API call failed [model=%s]: %s", chosen_model, exc, exc_info=True)
            return ""

        return self._extract_text(data)

    def _build_contents(
        self,
        *,
        prompt: str | list[dict] | None,
        messages: list[dict] | None,
    ) -> list[dict]:
        if messages:
            normalized = messages
        elif isinstance(prompt, list):
            normalized = prompt
        elif isinstance(prompt, str):
            normalized = [{"role": "user", "content": prompt}]
        else:
            return []

        contents: list[dict] = []
        for message in normalized:
            if not isinstance(message, dict):
                continue
            role = (message.get("role") or "user").lower()
            if role in {"assistant", "model"}:
                gemini_role = "model"
            else:
                gemini_role = "user"
            parts = self._to_parts(message.get("content"))
            if not parts:
                continue
            contents.append({"role": gemini_role, "parts": parts})
        return contents

    def _to_parts(self, content) -> list[dict]:
        if content is None:
            return []
        if isinstance(content, str):
            return [{"text": content}]
        if isinstance(content, dict):
            text = content.get("text") or content.get("content")
            return [{"text": text}] if text else []
        if isinstance(content, Iterable):
            parts: list[dict] = []
            for chunk in content:
                if isinstance(chunk, str):
                    parts.append({"text": chunk})
                elif isinstance(chunk, dict):
                    text = chunk.get("text") or chunk.get("content")
                    if text:
                        parts.append({"text": text})
            return parts
        return []

    def _extract_text(self, data: dict | None) -> str:
        if not isinstance(data, dict):
            return ""

        candidates = data.get("candidates")
        if not isinstance(candidates, list):
            return ""

        texts: list[str] = []
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            if not isinstance(content, dict):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue
            for part in parts:
                if isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str):
                        texts.append(text.strip())
        return " ".join(segment for segment in texts if segment)


__all__ = ["GeminiLLMAdapter"]
