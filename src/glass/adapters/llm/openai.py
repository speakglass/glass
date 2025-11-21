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
        max_tokens: int | None = None,
        response_schema: object | None = None,
        schema_context: dict[str, str] | None = None,
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
    ) -> str | dict:
        """Call OpenAI API with optional structured outputs.

        When response_schema is provided, automatically uses structured outputs
        via the Responses API for guaranteed JSON conformance.

        Args:
            prompt: Simple string prompt or list of messages
            messages: Full message array [{"role": "user", "content": "..."}]
            system: System prompt (prepended to messages)
            model: Model name (default: gpt-4.1-mini)
            temperature: Sampling temperature 0-2
            max_tokens: Max response tokens (None = no limit, let model/prompt decide)
            response_schema: Optional Pydantic model for structured output

        Returns:
            str: Response text when response_schema is None
            dict: Parsed structured data when response_schema is provided

        Usage:
            # Simple text
            result = await llm.call("Translate this", system="You are a translator")
            # result: str

            # Structured output
            from pydantic import BaseModel

            class Answer(BaseModel):
                steps: list[str]
                result: str

            result = await llm.call("Solve 8x + 7 = -23", response_schema=Answer)
            # result: dict = {"steps": [...], "result": "..."}
        """
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
        )

        chosen_model = model or self.model

        # Build messages
        input_messages: list[dict[str, str]] = []
        if system:
            input_messages.append({"role": "system", "content": system})

        if messages:
            input_messages.extend(messages)
        elif prompt:
            if isinstance(prompt, list):
                input_messages.extend(prompt)
            else:
                input_messages.append({"role": "user", "content": prompt})
        else:
            LOGGER.error("Either 'prompt' or 'messages' must be provided")
            return {} if response_schema else ""

        try:
            if response_schema:
                # Note: schema_context substitution not yet supported for OpenAI
                # OpenAI Responses API requires Pydantic models directly
                if schema_context:
                    LOGGER.debug(
                        "[OpenAI] schema_context provided but not yet supported for OpenAI adapter. "
                        "Language context should be clear from system prompt."
                    )

                # Use Structured Outputs via Responses API
                response = await client.responses.parse(
                    model=chosen_model,
                    input=input_messages,
                    text_format=response_schema,
                )

                if response.output_parsed:
                    return response.output_parsed.model_dump()
                return {}

            # Standard chat completion
            kwargs = {
                "model": chosen_model,
                "messages": input_messages,
                "temperature": temperature,
            }
            # Only set max_tokens if explicitly provided
            if max_tokens is not None:
                kwargs["max_tokens"] = max_tokens

            # Add tools if provided
            if tools:
                kwargs["tools"] = tools
                if tool_choice:
                    kwargs["tool_choice"] = tool_choice

            completion = await client.chat.completions.create(**kwargs)

            # Check for tool calls
            message = completion.choices[0].message
            if message.tool_calls:
                # Return tool call information
                return {
                    "type": "tool_calls",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        }
                        for tc in message.tool_calls
                    ],
                    "message": message.model_dump(),
                }

            return message.content or ""

        except Exception as e:
            LOGGER.error(f"OpenAI API call failed [model={chosen_model}]: {e}", exc_info=True)
            return {} if response_schema else ""
