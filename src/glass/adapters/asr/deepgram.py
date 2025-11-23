"""Deepgram realtime ASR adapter."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass
from typing import AsyncIterable, AsyncIterator
from urllib.parse import urlencode

import websockets
from websockets.exceptions import ConnectionClosed

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeepgramLanguageConfig:
    """Configuration for Deepgram language and model."""
    
    deepgram_code: str  # Deepgram language code (e.g., 'en', 'ko')
    model: str  # 'nova-3' or 'nova-2'


# Language mapping for supported languages
# Maps app language codes to Deepgram configuration
LANGUAGE_CONFIG: dict[str, DeepgramLanguageConfig] = {
    "en": DeepgramLanguageConfig(
        deepgram_code="en",
        model="nova-3"
    ),
    "ko": DeepgramLanguageConfig(
        deepgram_code="ko",
        model="nova-2"
    ),
    "ja": DeepgramLanguageConfig(
        deepgram_code="ja",
        model="nova-3"
    ),
    "es": DeepgramLanguageConfig(
        deepgram_code="es",
        model="nova-3"
    ),
    "fr": DeepgramLanguageConfig(
        deepgram_code="fr",
        model="nova-3"
    ),
}


def _get_language_config(language_code: str) -> DeepgramLanguageConfig:
    """
    Get Deepgram configuration for a given language code.
    
    Args:
        language_code: Language code (e.g., 'en', 'ko', 'ja')
        
    Returns:
        DeepgramLanguageConfig with appropriate model and language code
    """
    return LANGUAGE_CONFIG.get(language_code, LANGUAGE_CONFIG["en"])


class DeepgramASRAdapter:
    """Realtime ASR adapter backed by Deepgram's WebSocket API."""

    def __init__(
        self,
        api_key: str,
        *,
        language: str = "en",
        encoding: str = "linear16",
        sample_rate: int = 16000,
        enable_punctuate: bool = True,
        interim_results: bool = True,
        utterance_end_ms: int | None = None,
        endpointing_ms: int | None = None,
        vad_events: bool = True,
        endpoint: str = "wss://api.deepgram.com/v1/listen",
    ) -> None:
        if not api_key:
            msg = "Deepgram API key is required."
            raise ValueError(msg)
        self.api_key = api_key
        self.language = language
        self.encoding = encoding
        self.sample_rate = sample_rate
        self.enable_punctuate = enable_punctuate
        self.interim_results = interim_results
        self.utterance_end_ms = utterance_end_ms
        self.endpointing_ms = endpointing_ms
        self.vad_events = vad_events
        self.endpoint = endpoint.rstrip("/")

    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
        language: str | None = None,
    ) -> AsyncIterator[dict]:
        # Resolve language configuration automatically
        lang_code = language or self.language
        config = _get_language_config(lang_code)
        stream_language = config.deepgram_code
        stream_model = config.model
        
        params = {
            "model": stream_model,
            "language": stream_language,
            "encoding": self.encoding,
            "sample_rate": str(self.sample_rate),
            "punctuate": str(self.enable_punctuate).lower(),
            "interim_results": str(self.interim_results).lower(),
            "smart_format": "true",
        }
        if self.utterance_end_ms is not None:
            params["utterance_end_ms"] = str(self.utterance_end_ms)
        # Allow disabling endpointing by setting it to None
        if self.endpointing_ms is None:
            params["endpointing"] = "false"
        else:
            params["endpointing"] = str(self.endpointing_ms)
        params["vad_events"] = str(self.vad_events).lower()
        uri = f"{self.endpoint}?{urlencode(params)}"
        headers = {
            "Authorization": f"Token {self.api_key}",
            "User-Agent": "glass/0.1",
        }

        async with websockets.connect(
            uri,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=20,
            max_size=2**20,
        ) as ws:
            LOGGER.info(f"Deepgram connection opened for session {session_id}, source={source}, language={lang_code} -> {stream_language}, model={stream_model}")
            
            # Create tasks for bidirectional communication
            async def send_audio():
                try:
                    async for chunk in audio_iter:
                        if chunk:
                            await ws.send(chunk)
                    await ws.send(json.dumps({"type": "CloseStream"}))
                except Exception as e:
                    LOGGER.debug(f"Send audio exception: {e}")
            
            async def send_keepalive():
                """Send KeepAlive messages every 3-4 seconds to prevent Deepgram timeout."""
                keepalive_msg = json.dumps({"type": "KeepAlive"})
                try:
                    while True:
                        await asyncio.sleep(3.5)  # Send every 3.5 seconds (within 3-5 range)
                        await ws.send(keepalive_msg)
                        LOGGER.debug(f"Sent KeepAlive to Deepgram for session {session_id}")
                except Exception as e:
                    LOGGER.debug(f"KeepAlive exception: {e}")
            
            sender_task = asyncio.create_task(send_audio())
            keepalive_task = asyncio.create_task(send_keepalive())
            
            try:
                async for raw_message in ws:
                    # Raw Deepgram messages are very verbose; keep at DEBUG level
                    LOGGER.debug(f"[Deepgram Raw] session={session_id}, source={source}: {raw_message}")  # type: ignore[str-bytes-safe]
                    events = self._parse_message(raw_message, stream_language, session_id, source)
                    if events is None:
                        continue
                    # _parse_message can now return multiple events (segments)
                    if isinstance(events, dict):
                        events = [events]
                    for event in events:
                        if event:
                            yield event
            except ConnectionClosed as exc:
                LOGGER.debug("Deepgram stream closed for %s: %s", session_id, exc)
                raise
            finally:
                sender_task.cancel()
                keepalive_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sender_task
                    await keepalive_task

    def _parse_message(self, raw_message: str | bytes, stream_language: str, session_id: str, source: str | None) -> list[dict] | dict | None:
        try:
            if isinstance(raw_message, bytes):
                raw_message = raw_message.decode("utf-8")
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            LOGGER.debug("Unable to decode Deepgram message: %r", raw_message)
            return None

        msg_type = (payload.get("type") or "").lower()

        if msg_type == "error":
            error = payload.get("message") or payload.get("description") or "Deepgram error"
            raise RuntimeError(f"Deepgram ASR error: {error}")

        # UtteranceEnd event
        if msg_type == "utteranceend":
            return {
                "event": "utterance_end",
                "last_word_end": payload.get("last_word_end"),
                "channel": payload.get("channel"),
            }

        if msg_type not in {"transcript", "results"}:
            return None

        channel = payload.get("channel", {})
        alternatives = channel.get("alternatives") or payload.get("alternatives") or []
        if not alternatives:
            return None

        alt = alternatives[0] or {}
        if not isinstance(alt, dict):
            return None
        transcript = alt.get("transcript") or alt.get("text") or ""
        if not transcript:
            return None

        # Simple pass-through; do not carryover/segment
        combined = transcript.strip()

        result = alt.get("result") if isinstance(alt, dict) else None
        if not isinstance(result, dict):
            result = {}
        is_final = bool(payload.get("is_final") or channel.get("is_final") or result.get("final"))
        speech_final = bool(payload.get("speech_final"))
        
        # Extract words (if available)
        words = []
        raw_words = alt.get("words")
        if isinstance(raw_words, list):
            for w in raw_words:
                if isinstance(w, dict):
                    words.append({
                        "start": w.get("start"),
                        "end": w.get("end"),
                        "word": w.get("punctuated_word") or w.get("word") or "",
                    })

        detected_lang = payload.get("language") or stream_language

        # Pass through Deepgram's start and duration as-is (if provided)
        start = payload.get("start")
        duration = payload.get("duration")

        # If not final, emit interim
        if not is_final and not speech_final:
            event: dict = {"partial": combined, "final": False}
            if words:
                event["words"] = words
            if start is not None:
                event["start"] = start
            if duration is not None:
                event["duration"] = duration
            return event

        # Final: emit once with optional speech_final
        if combined:
            event = {
                "text": combined,
                "final": True,
                "is_final": is_final,
                "speech_final": speech_final,
                "lang": detected_lang,
            }
            if words:
                event["words"] = words
            if start is not None:
                event["start"] = start
            if duration is not None:
                event["duration"] = duration
            return event
        return None
    
