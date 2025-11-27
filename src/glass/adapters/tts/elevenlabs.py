"""ElevenLabs TTS adapter."""

from __future__ import annotations

import base64
import logging
import json
from typing import AsyncIterable, Any

import httpx

LOGGER = logging.getLogger(__name__)


class ElevenLabsTTSAdapter:
    """ElevenLabs text-to-speech adapter."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "eleven_flash_v2_5",
        default_voice_id: str = "cgSgspJ2msm6clMCkdW9",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        timeout: float = 30.0,
    ) -> None:
        """Initialize ElevenLabs TTS adapter.

        Args:
            api_key: ElevenLabs API key
            model: Model ID to use
            default_voice_id: Default voice ID
            stability: Voice stability (0-1)
            similarity_boost: Voice similarity boost (0-1)
            timeout: Request timeout in seconds
        """
        if not api_key:
            msg = "ElevenLabs API key is required."
            raise ValueError(msg)

        self.api_key = api_key
        self.model = model
        self.default_voice_id = default_voice_id
        self.stability = stability
        self.similarity_boost = similarity_boost
        self.timeout = timeout

    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        language: str | None = None,
    ) -> AsyncIterable[dict[str, Any]]:
        """Stream synthesized audio from ElevenLabs.

        Args:
            text: Text to synthesize
            voice_id: Voice ID (uses default if None)
            language: Language code (not used by ElevenLabs, voice determines language)

        Yields:
            Audio data chunks (MP3 format)
        """
        voice = voice_id or self.default_voice_id
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream/with-timestamps"

        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "model_id": self.model,
            # with-timestamps always returns MP3, no need to specify output_format
            "voice_settings": {
                "stability": self.stability,
                "similarity_boost": self.similarity_boost,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }

        LOGGER.info(f"[ElevenLabs] Synthesizing text: {text[:50]}...")
        collected_characters: list[str] = []
        collected_starts: list[float | None] = []
        collected_ends: list[float | None] = []

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        LOGGER.error(f"[ElevenLabs] API error: {error_text.decode()}")
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            payload_chunk = json.loads(line)
                        except json.JSONDecodeError:
                            LOGGER.debug(f"[ElevenLabs] Skipping undecodable chunk: {line[:32]}...")
                            continue

                        chunk: dict[str, Any] = {}
                        audio_b64 = payload_chunk.get("audio_base64")
                        if audio_b64:
                            try:
                                chunk["audio"] = base64.b64decode(audio_b64)
                            except Exception as exc:  # pragma: no cover - defensive
                                LOGGER.debug(f"[ElevenLabs] Failed to decode audio chunk: {exc}")

                        alignment = payload_chunk.get("alignment") or payload_chunk.get("normalized_alignment")
                        if isinstance(alignment, dict):
                            self._collect_alignment(alignment, collected_characters, collected_starts, collected_ends)

                        if chunk:
                            yield chunk

            LOGGER.info("[ElevenLabs] Synthesis completed")
            if collected_characters:
                segments = self._build_segments(text, collected_characters, collected_starts, collected_ends)
                if segments:
                    yield {"segments": segments}

        except Exception as e:
            LOGGER.error(f"[ElevenLabs] Synthesis failed: {e}", exc_info=True)
            return

    @staticmethod
    def _collect_alignment(
        alignment: dict[str, Any],
        characters: list[str],
        starts: list[float | None],
        ends: list[float | None],
    ) -> None:
        raw_chars = alignment.get("characters") or []
        raw_starts = alignment.get("character_start_times_seconds") or []
        raw_ends = alignment.get("character_end_times_seconds") or []

        for idx, char in enumerate(raw_chars):
            if not isinstance(char, str):
                continue
            characters.append(char)
            start_val: float | None = None
            end_val: float | None = None
            if idx < len(raw_starts):
                start_candidate = raw_starts[idx]
                if isinstance(start_candidate, (int, float)):
                    start_val = float(start_candidate)
            if idx < len(raw_ends):
                end_candidate = raw_ends[idx]
                if isinstance(end_candidate, (int, float)):
                    end_val = float(end_candidate)
            starts.append(start_val)
            ends.append(end_val)

    @staticmethod
    def _build_segments(
        original_text: str,
        characters: list[str],
        starts: list[float | None],
        ends: list[float | None],
    ) -> list[dict[str, Any]]:
        segments: list[dict[str, Any]] = []
        buffer: list[str] = []
        buffer_start_time: float | None = None
        buffer_end_time: float | None = None
        whitespace_tokens = {" ", "\n", "\t", "\r", "▁"}

        def flush() -> None:
            nonlocal buffer, buffer_start_time, buffer_end_time
            if not buffer:
                buffer_start_time = None
                buffer_end_time = None
                return
            text = "".join(buffer).strip()
            if text:
                segments.append(
                    {
                        "text": "".join(buffer),
                        "start_ms": ElevenLabsTTSAdapter._seconds_to_ms(buffer_start_time, buffer_end_time),
                        "end_ms": ElevenLabsTTSAdapter._seconds_to_ms(buffer_end_time, buffer_end_time),
                    }
                )
            buffer = []
            buffer_start_time = None
            buffer_end_time = None

        for idx, letter in enumerate(characters):
            value = letter or ""
            is_space = value in whitespace_tokens or value.isspace()
            start_time = starts[idx] if idx < len(starts) else None
            end_time = ends[idx] if idx < len(ends) else None

            if is_space:
                flush()
                continue

            if buffer_start_time is None:
                buffer_start_time = start_time
            buffer_end_time = end_time if end_time is not None else buffer_end_time
            buffer.append(value)

        flush()

        if not segments:
            return []

        cursor = 0
        normalized_segments: list[dict[str, Any]] = []
        text_length = len(original_text)

        for segment in segments:
            span_text = segment["text"]
            start_idx = original_text.find(span_text, cursor)
            if start_idx == -1:
                start_idx = cursor
            end_idx = min(start_idx + len(span_text), text_length)
            cursor = end_idx
            normalized_segments.append(
                {
                    "text": span_text,
                    "start_ms": segment["start_ms"],
                    "end_ms": segment["end_ms"],
                    "char_start": start_idx,
                    "char_end": end_idx,
                }
            )

        return normalized_segments

    @staticmethod
    def _seconds_to_ms(primary: float | None, fallback: float | None) -> int:
        value = primary if primary is not None else fallback
        if value is None:
            return 0
        return max(int(value * 1000), 0)
