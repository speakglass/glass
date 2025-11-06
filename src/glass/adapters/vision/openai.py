"""OpenAI vision adapter describing uploaded images."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import httpx


class OpenAIVisionAdapter:
    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-4.1-mini",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 15.0,
    ) -> None:
        if not api_key:
            raise ValueError("OpenAI API key is required for vision.")
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def describe(self, session_id: str, image_ref: dict) -> str:
        path = image_ref.get("local_path")
        if not path:
            return ""
        file_path = Path(path)
        if not file_path.exists():
            return ""
        image_bytes = file_path.read_bytes()
        media_type = image_ref.get("mime", "image/png")
        b64_data = base64.b64encode(image_bytes).decode("utf-8")
        prompt = self._build_prompt(session_id, image_ref)

        payload = {
            "model": self.model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {
                            "type": "input_image",
                            "image": {
                                "b64": b64_data,
                                "media_type": media_type,
                            },
                        },
                    ],
                }
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/responses", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return self._extract_text(data)

    @staticmethod
    def _build_prompt(session_id: str, image_ref: dict) -> str:
        tags = image_ref.get("tags") or []
        tag_text = f" Tags: {', '.join(tags)}." if tags else ""
        return (
            "You are an assistant that extracts concise screen descriptions for meeting copilots."
            f" Summarize key UI elements and text for session {session_id}.{tag_text}"
        )

    @staticmethod
    def _extract_text(payload: dict[str, Any]) -> str:
        output = payload.get("output") or []
        if not isinstance(output, list):
            return ""
        texts: list[str] = []
        for item in output:
            content = item.get("content") if isinstance(item, dict) else None
            if not isinstance(content, list):
                continue
            for fragment in content:
                if isinstance(fragment, dict) and fragment.get("type") == "output_text":
                    texts.append(fragment.get("text", ""))
        return " ".join(t.strip() for t in texts if t).strip()
