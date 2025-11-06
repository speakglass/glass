"""NVIDIA NIM diarization adapter."""

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


class NvidiaNIMDiarizationAdapter:
    """Connect to an NVIDIA NIM/Riva diarization endpoint via WebSocket."""

    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        model: str = "nvidia/diar_streaming_sortformer_4spk-v2",
    ) -> None:
        if not api_key:
            raise ValueError("NVIDIA API key is required.")
        if not endpoint:
            raise ValueError("NVIDIA diarization endpoint is required.")
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
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
                LOGGER.debug("NVIDIA diarization stream closed for %s: %s", session_id, exc)
                raise
            finally:
                sender_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sender_task

    async def _send_start(self, ws) -> None:
        config = {
            "type": "start",
            "config": {
                "enable_partial_results": True,
            },
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
            LOGGER.debug("NVIDIA diarization upstream closed while sending audio.")
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Error streaming audio to NVIDIA diarization endpoint.")
            raise

    def _parse_message(self, raw_message: str | bytes) -> dict | None:
        try:
            if isinstance(raw_message, bytes):
                raw_message = raw_message.decode("utf-8")
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            LOGGER.debug("Unable to decode NVIDIA diarization message: %r", raw_message)
            return None

        if payload.get("type") == "error":
            detail = payload.get("message") or payload.get("detail") or "NVIDIA diarization error"
            raise RuntimeError(detail)

        if segments := payload.get("segments"):
            return {"segments": segments}

        speaker = payload.get("speaker") or payload.get("speaker_tag")
        start = payload.get("start") or payload.get("begin")
        end = payload.get("end")
        if speaker and start is not None and end is not None:
            return {
                "speaker": speaker,
                "start": start,
                "end": end,
                "confidence": payload.get("confidence"),
            }
        return None

    def _compose_uri(self, params: dict[str, str]) -> str:
        query = urlencode(params)
        delimiter = "&" if "?" in self.endpoint else "?"
        return f"{self.endpoint}{delimiter}{query}"
