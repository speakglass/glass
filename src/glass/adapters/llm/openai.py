from __future__ import annotations

import logging

import httpx

LOGGER = logging.getLogger(__name__)


class OpenAILLMAdapter:
    """OpenAI API adapter supporting gpt-5* and gpt-4.1* models."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gpt-4.1-mini",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 15.0,
    ) -> None:
        if not api_key:
            msg = "OpenAI API key is required."
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
        """Call OpenAI chat completions API.

        Supports standard OpenAI models via chat completions API.

        Args:
            prompt: Simple string prompt or list of messages
            messages: Full message array [{"role": "user", "content": "..."}]
            system: System prompt (prepended to messages)
            model: Model name (default: gpt-4.1-mini)
            temperature: Sampling temperature 0-2
            max_tokens: Max response tokens
            json_mode: Force JSON response

        Usage:
            # Simple prompt
            await llm.call("Translate this", system="You are a translator")

            # With messages
            await llm.call(messages=[{"role": "user", "content": "Hello"}])

            # Multi-turn
            await llm.call(messages=[
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello!"},
                {"role": "user", "content": "How are you?"}
            ])
        """
        chosen_model = model or self.model
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            # Build input for Responses API
            # Responses API uses 'input' instead of 'messages'
            prelude_messages: list[dict[str, str]] = []
            if system:
                prelude_messages.append({"role": "system", "content": system})
            if json_mode:
                # Lower-case "json" to satisfy OpenAI Responses API requirement
                prelude_messages.append(
                    {
                        "role": "system",
                        "content": "Respond only with strict json output and return valid json.",
                    }
                )

            if messages:
                # Use messages array directly as input
                input_data = messages.copy()
                if prelude_messages:
                    input_data = prelude_messages + input_data
            elif prompt:
                if isinstance(prompt, list):
                    input_data = prompt.copy()
                    if prelude_messages:
                        input_data = prelude_messages + input_data
                else:
                    # Simple string prompt
                    if prelude_messages:
                        input_data = prelude_messages + [{"role": "user", "content": prompt}]
                    else:
                        input_data = prompt
            else:
                LOGGER.error("Either 'prompt' or 'messages' must be provided")
                return ""

            # Responses API payload
            payload = {
                "model": chosen_model,
                "input": input_data,
                "max_output_tokens": max_tokens,
                "temperature": temperature,
            }

            if json_mode:
                # For structured outputs in Responses API
                payload["text"] = {"format": {"type": "json_object"}}

            # GPT-5 specific: add reasoning effort
            if chosen_model.startswith("gpt-5"):
                payload["reasoning"] = {"effort": "low"}

            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                response = await client.post("/responses", json=payload, headers=headers)
                if response.status_code != 200:
                    error_detail = response.text
                    LOGGER.error(f"OpenAI API error [{response.status_code}]: {error_detail}")
                    LOGGER.debug(f"Request payload: {payload}")
                response.raise_for_status()
                data = response.json()

            # Extract text from responses API format
            # Check for output_text helper property first (if available in SDK)
            if "output_text" in data:
                return data["output_text"].strip()

            # Otherwise parse output array manually
            output = data.get("output", [])
            if not isinstance(output, list):
                return ""

            parts = []
            for segment in output:
                if isinstance(segment, dict):
                    # Look for message type items
                    if segment.get("type") == "message":
                        for fragment in segment.get("content", []):
                            if isinstance(fragment, dict) and fragment.get("type") == "output_text":
                                parts.append(fragment.get("text", ""))

            return " ".join(part.strip() for part in parts if part).strip()

        except Exception as e:
            LOGGER.error(f"OpenAI API call failed [model={chosen_model}]: {e}", exc_info=True)
            return ""
