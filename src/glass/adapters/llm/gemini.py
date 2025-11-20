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
        max_tokens: int | None = None,
        response_schema: object | None = None,
        schema_context: dict[str, str] | None = None,
    ) -> str | dict:
        """Call Gemini API with optional structured outputs.

        When response_schema is provided, automatically configures JSON mode
        with schema validation for guaranteed structured responses.

        Args:
            prompt: Simple string prompt or list of messages
            messages: Full message array [{"role": "user", "content": "..."}]
            system: System prompt
            model: Model name (default: gemini-2.5-flash)
            temperature: Sampling temperature 0-2
            max_tokens: Max response tokens (None = no limit, let model/prompt decide)
            response_schema: Optional Pydantic model or dict schema for structured output

        Returns:
            str: Response text when response_schema is None
            dict: Parsed structured data when response_schema is provided

        Usage:
            # Simple text
            result = await llm.call("Tell me about AI")
            # result: str

            # Structured output
            from pydantic import BaseModel

            class CountryInfo(BaseModel):
                name: str
                population: int
                capital: str

            result = await llm.call("Info about Japan", response_schema=CountryInfo)
            # result: dict = {"name": "Japan", "population": ..., "capital": "Tokyo"}
        """
        import json

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)

        chosen_model = model or self.model

        contents = self._build_contents(prompt=prompt, messages=messages)
        if not contents:
            LOGGER.error("Failed to build Gemini contents payload")
            return {} if response_schema else ""

        # Build configuration
        config_args = {
            "temperature": temperature,
        }

        # Only set max_output_tokens if explicitly provided
        if max_tokens is not None:
            config_args["max_output_tokens"] = max_tokens

        if response_schema:
            config_args["response_mime_type"] = "application/json"

            # Extract schema from Pydantic model or use dict directly
            if hasattr(response_schema, "model_json_schema"):
                schema_dict = response_schema.model_json_schema()
                # Apply dynamic context substitution if provided
                if schema_context:
                    schema_dict = self._apply_schema_context(schema_dict, schema_context)
                config_args["response_schema"] = schema_dict
            elif isinstance(response_schema, dict):
                schema_dict = response_schema
                if schema_context:
                    schema_dict = self._apply_schema_context(schema_dict, schema_context)
                config_args["response_schema"] = schema_dict
            else:
                # Try passing the Pydantic class directly (Gemini SDK may handle it)
                config_args["response_schema"] = response_schema

        if system:
            config_args["system_instruction"] = system

        try:
            response = await client.aio.models.generate_content(
                model=chosen_model,
                contents=contents,
                config=types.GenerateContentConfig(**config_args),
            )

            # Extract text from response (standard method)
            try:
                response_text = response.text
            except Exception as e:
                LOGGER.error(f"[Gemini] Failed to get response text: {e}")
                return {} if response_schema else ""

            if not response_text or not response_text.strip():
                LOGGER.error(f"[Gemini] Empty response from model {chosen_model}")
                return {} if response_schema else ""

            # Parse JSON response if schema was provided
            if response_schema:
                try:
                    parsed = json.loads(response_text)
                    return parsed
                except json.JSONDecodeError as e:
                    LOGGER.error(f"[Gemini] Failed to parse JSON response: {e}")
                    LOGGER.error(f"[Gemini] Raw text was: {response_text[:500]}")
                    return {}

            return response_text

        except Exception as exc:
            LOGGER.error("Gemini API call failed [model=%s]: %s", chosen_model, exc, exc_info=True)
            return {} if response_schema else ""

    def _build_contents(
        self,
        *,
        prompt: str | list[dict] | None,
        messages: list[dict] | None,
    ) -> list[dict] | list[str] | str:
        """Build contents for Google GenAI SDK.

        The SDK expects a list of Part objects, or strings, or a list of strings/dicts.
        We will convert our internal format to what the SDK expects.
        """
        if messages:
            normalized = messages
        elif isinstance(prompt, list):
            normalized = prompt
        elif isinstance(prompt, str):
            # Simple string prompt
            return prompt
        else:
            return []

        # For chat history, we need to format as list of Content objects or compatible dicts
        contents = []
        for message in normalized:
            if not isinstance(message, dict):
                continue
            role = (message.get("role") or "user").lower()

            # Map roles: 'assistant' -> 'model'
            if role in {"assistant", "model"}:
                gemini_role = "model"
            else:
                gemini_role = "user"

            parts = []
            content = message.get("content")

            if isinstance(content, str):
                parts.append({"text": content})
            elif isinstance(content, list):
                for chunk in content:
                    if isinstance(chunk, str):
                        parts.append({"text": chunk})
                    elif isinstance(chunk, dict):
                        text = chunk.get("text") or chunk.get("content")
                        if text:
                            parts.append({"text": text})

            if parts:
                contents.append({"role": gemini_role, "parts": parts})

        return contents

    def _to_parts(self, content) -> list[dict]:
        # Deprecated helper, kept if needed but _build_contents now handles it
        if content is None:
            return []
        if isinstance(content, str):
            return [{"text": content}]
        return []

    @staticmethod
    def _apply_schema_context(schema: dict, context: dict[str, str]) -> dict:
        """Recursively apply context substitutions to schema descriptions.

        Replaces placeholders like {TARGET} or {NATIVE} with actual language names.

        Args:
            schema: JSON schema dictionary
            context: Substitution context (e.g., {"TARGET": "Japanese", "NATIVE": "Korean"})

        Returns:
            Modified schema with substituted descriptions
        """
        import copy

        schema = copy.deepcopy(schema)

        def substitute_text(text: str) -> str:
            if not isinstance(text, str):
                return text
            for key, value in context.items():
                text = text.replace(f"{{{key}}}", value)
            return text

        def recurse(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if key == "description" and isinstance(value, str):
                        obj[key] = substitute_text(value)
                    else:
                        recurse(value)
            elif isinstance(obj, list):
                for item in obj:
                    recurse(item)

        recurse(schema)
        return schema

    def _extract_text(self, data: dict | None) -> str:
        # Deprecated helper
        return ""


__all__ = ["GeminiLLMAdapter"]
