"""NVIDIA NIM streaming ASR adapter."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import AsyncIterable, AsyncIterator
from urllib.parse import urlencode

import websockets
from websockets.exceptions import ConnectionClosed

LOGGER = logging.getLogger(__name__)


class NvidiaNIMASRAdapter:
    """Realtime ASR adapter powered by NVIDIA NIM models."""

    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        model: str = "nvidia/parakeet-tdt-0.6b-v3",
        language: str = "en-US",
        diarize: bool = False,
        speaker_count: int = 4,
    ) -> None:
        if not api_key:
            raise ValueError("NVIDIA API key is required.")
        if not endpoint:
            raise ValueError("NVIDIA ASR endpoint is required.")
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.language = language
        self.diarize = diarize
        self.speaker_count = speaker_count

    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
        language: str | None = None,
        model: str | None = None,
    ) -> AsyncIterator[dict]:
        params = {"model": self.model}
        uri = self._compose_uri(params)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "glass/0.1",
        }
        async with websockets.connect(
            uri,
            extra_headers=headers,
            max_size=2**20,
            ping_interval=20,
            ping_timeout=20,
        ) as ws:
            await self._send_start(ws)
            sender_task = asyncio.create_task(self._forward_audio(ws, audio_iter))
            try:
                async for raw_message in ws:
                    event = self._parse_message(raw_message)
                    if event is None:
                        continue
                    yield event
            except ConnectionClosed as exc:
                LOGGER.debug("NVIDIA stream closed for %s: %s", session_id, exc)
                raise
            finally:
                sender_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sender_task

    async def _send_start(self, ws) -> None:
        config = {
            "type": "start",
            "config": {
                "language": self.language,
                "sampling_rate": 16000,
                "enable_partial_results": True,
            },
        }
        if self.diarize:
            config["config"]["diarization"] = {
                "enable": True,
                "max_speakers": self.speaker_count,
            }
        await ws.send(json.dumps(config))

    async def _forward_audio(self, ws, audio_iter: AsyncIterable[bytes]) -> None:
        try:
            async for chunk in audio_iter:
                if not chunk:
                    continue
                await ws.send(chunk)
            await ws.send(json.dumps({"type": "stop"}))
        except ConnectionClosed:
            LOGGER.debug("NVIDIA upstream closed while sending audio.")
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Error streaming audio to NVIDIA ASR.")
            raise

    def _parse_message(self, raw_message: str | bytes) -> dict | None:
        try:
            if isinstance(raw_message, bytes):
                raw_message = raw_message.decode("utf-8")
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            LOGGER.debug("Unable to decode NVIDIA ASR message: %r", raw_message)
            return None

        if payload.get("type") == "error":
            detail = payload.get("message") or payload.get("detail") or "NVIDIA ASR error"
            raise RuntimeError(detail)

        msg_type = (payload.get("type") or payload.get("message_type") or "").lower()
        text = payload.get("text") or payload.get("transcript") or ""

        if not text and "segments" in payload:
            segments = payload["segments"] or []
            texts = [seg.get("text") for seg in segments if isinstance(seg, dict) and seg.get("text")]
            text = " ".join(texts)

        if not text:
            return None

        is_final = bool(
            payload.get("is_final")
            or payload.get("completed")
            or msg_type in {"final", "final_transcription", "complete"}
        )

        speaker = payload.get("speaker") or payload.get("speaker_tag") or payload.get("speaker_id")

        if not is_final or msg_type in {"partial", "hypothesis"}:
            event = {"partial": text, "final": False}
            if speaker:
                event["speaker"] = speaker
            return event

        event = {
            "text": text,
            "final": True,
            "lang": payload.get("language") or self.language,
        }
        if speaker:
            event["speaker"] = speaker
        if "segments" in payload:
            event["segments"] = payload["segments"]
        return event

    def _compose_uri(self, params: dict[str, str]) -> str:
        query = urlencode(params)
        delimiter = "&" if "?" in self.endpoint else "?"
        return f"{self.endpoint}{delimiter}{query}"
