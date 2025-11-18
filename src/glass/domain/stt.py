"""Speech-to-text transcription."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, AsyncIterable, Callable, Any, Optional

if TYPE_CHECKING:
    from .ports import ASRPort

from .entities import EventType

LOGGER = logging.getLogger(__name__)


class SpeechRecognition:
    """Handle real-time speech-to-text transcription."""

    def __init__(
        self,
        session_id: str,
        asr: ASRPort,
        emit_callback,
        handle_transcript_callback,
        speech_activity_callback: Callable[[str], None] | None = None,
    ):
        self.session_id = session_id
        self.asr = asr
        self._emit = emit_callback
        self._handle_transcript = handle_transcript_callback
        self._speech_activity_callback = speech_activity_callback
        
        # Track active utterance per source (for grouping partials)
        self._active_utterance_id: dict[str, str] = {}
        # Store the most recent finalized payload per source until speech completion
        self._pending_transcripts: dict[str, dict[str, Any]] = {}
        # Track last partial transcript per source in case we need to finalize early
        self._last_partial_payload: dict[str, dict[str, Any]] = {}
        self._audio_cursor = 0.0

    def advance_audio_cursor(self, samples: int, sample_rate: int = 16000) -> None:
        if samples <= 0:
            return
        self._audio_cursor += samples / float(sample_rate)

    def advance_audio_cursor_from_chunk(self, chunk: bytes, sample_rate: int = 16000) -> None:
        if not chunk:
            return
        samples = len(chunk) // 2
        self.advance_audio_cursor(samples, sample_rate)

    async def process_stream(
        self,
        queue: asyncio.Queue,
        *,
        source: str,
        language: str | None = None,
        event_type_transcript,
        event_type_partial,
    ) -> None:
        """Process audio stream and emit transcription events."""
        async def queue_iter():
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item

        async def finalize_pending(source: str, *, reason: str) -> None:
            LOGGER.debug("Finalizing transcript for %s (%s)", source, reason)
            pending = self._pending_transcripts.pop(source, None)
            if not pending:
                pending = self._last_partial_payload.pop(source, None)
            if not pending:
                return
            text = (pending.get("text") or "").strip()
            if not text:
                return

            payload = dict(pending)
            payload["__completion_reason"] = reason
            already_final = bool(payload.get("speech_final"))
            if not already_final:
                payload["speech_final"] = True
            formatted = self._format_transcript_payload(payload)
            if not already_final:
                await self._emit(event_type_transcript, formatted, source=source)
            await self._handle_transcript(
                text=text,
                lang=payload.get("lang", "en"),
                source=source,
                utterance_id=payload.get("utterance_id"),
                start=payload.get("start"),
                duration=payload.get("duration"),
                speech_final=True,
            )
            self._active_utterance_id.pop(source, None)
            self._last_partial_payload.pop(source, None)
            await self._emit_utterance_completed(formatted, source=source)

        stream = self.asr.stream(  # type: ignore[attr-defined]
            self.session_id, queue_iter(), source=source, language=language
        )
        async for chunk in stream:
            chunk_source = chunk.get("source") or source
            event_name = chunk.get("event")

            # Utterance end - just emit and cleanup
            if event_name == "utterance_end":
                await finalize_pending(chunk_source, reason="utterance_end")
                self._active_utterance_id.pop(chunk_source, None)
                continue

            # Partial transcript - emit for UI updates
            if chunk.get("partial"):
                # Create or reuse utterance_id
                utterance_id = self._active_utterance_id.get(chunk_source)
                if not utterance_id:
                    utterance_id = str(uuid.uuid4())
                    self._active_utterance_id[chunk_source] = utterance_id
                if self._speech_activity_callback and chunk_source and str(chunk_source).startswith("mic"):
                    try:
                        self._speech_activity_callback(chunk_source)
                    except Exception:
                        LOGGER.debug("Speech activity callback failed for %s", chunk_source, exc_info=True)

                text = (chunk.get("partial") or "").strip()
                if text:
                    partial_payload: dict[str, Any] = {"text": text, "utterance_id": utterance_id}
                    if chunk.get("start") is not None:
                        partial_payload["start"] = chunk["start"]
                    if chunk.get("duration") is not None:
                        partial_payload["duration"] = chunk["duration"]
                    if chunk.get("lang"):
                        partial_payload["lang"] = chunk["lang"]
                    formatted = self._format_transcript_payload(partial_payload)
                    await self._emit(event_type_partial, formatted, source=chunk_source)
                    self._last_partial_payload[chunk_source] = partial_payload
                continue

            # Final transcript
            if chunk.get("final"):
                # Create or reuse utterance_id
                utterance_id = self._active_utterance_id.get(chunk_source)
                if not utterance_id:
                    utterance_id = str(uuid.uuid4())
                    self._active_utterance_id[chunk_source] = utterance_id
                
                text = (chunk.get("text") or "").strip()
                if not text:
                    continue
                
                # Build payload
                payload = {
                    "text": text,
                    "utterance_id": utterance_id,
                    "is_final": chunk.get("is_final", True),
                    "speech_final": chunk.get("speech_final", False),
                }
                if "auto_tts" in chunk:
                    payload["auto_tts"] = chunk.get("auto_tts")
                if chunk.get("lang"):
                    payload["lang"] = chunk["lang"]
                if chunk.get("start") is not None:
                    payload["start"] = chunk["start"]
                if chunk.get("duration") is not None:
                    payload["duration"] = chunk["duration"]
                if chunk.get("words") is not None:
                    payload["words"] = chunk.get("words")
                existing = self._pending_transcripts.get(chunk_source)
                if existing and existing.get("utterance_id") != utterance_id:
                    await finalize_pending(chunk_source, reason="utterance_switch")
                    existing = None

                if existing and existing.get("utterance_id") == utterance_id:
                    prev_text = existing.get("text", "")
                    payload["text"] = self._merge_transcripts(prev_text, text)
                    if existing.get("start") is not None and payload.get("start") is None:
                        payload["start"] = existing["start"]
                    if payload.get("duration") is None and existing.get("duration") is not None:
                        payload["duration"] = existing["duration"]
                    if not payload.get("lang") and existing.get("lang"):
                        payload["lang"] = existing["lang"]

                # Emit transcript update for UI
                formatted = self._format_transcript_payload(payload)
                await self._emit(event_type_transcript, formatted, source=chunk_source)

                # Track pending transcript until speech completion
                self._pending_transcripts[chunk_source] = payload
                # Once a final arrives, partial cache is no longer needed
                self._last_partial_payload.pop(chunk_source, None)
                if payload.get("speech_final"):
                    await finalize_pending(chunk_source, reason="speech_final")
                continue

    async def _emit_utterance_completed(self, formatted: dict[str, Any], *, source: str | None = None) -> None:
        payload = {
            "utterance_id": formatted.get("utterance_id"),
            "text": formatted.get("text"),
            "start": formatted.get("start"),
            "end": formatted.get("end"),
            "duration": formatted.get("duration"),
            "audio_cursor": formatted.get("audio_cursor"),
            "latency_ms": formatted.get("latency_ms"),
            "completed_by": formatted.get("completed_by"),
            "lang": formatted.get("lang"),
        }
        await self._emit(EventType.UTTERANCE_COMPLETED, payload, source=source)

    def _format_transcript_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        start = self._to_float(payload.get("start"))
        duration = self._to_float(payload.get("duration"))
        end = self._to_float(payload.get("end"))
        if end is None and start is not None and duration is not None:
            end = start + duration
        if duration is None and start is not None and end is not None:
            duration = max(end - start, 0.0)
        text = (payload.get("text") or "").strip()
        completion_reason = payload.get("__completion_reason")
        if not completion_reason:
            if payload.get("speech_final"):
                completion_reason = "speech_final"
            elif payload.get("is_final"):
                completion_reason = "is_final"
        event_payload: dict[str, Any] = {
            "text": text,
            "utterance_id": payload.get("utterance_id"),
            "start": start,
            "end": end,
            "duration": duration,
            "audio_cursor": self._audio_cursor,
            "latency_ms": self._estimate_latency(end),
            "lang": payload.get("lang"),
            "speech_final": payload.get("speech_final"),
            "is_final": payload.get("is_final"),
        }
        if completion_reason:
            event_payload["completed_by"] = completion_reason
        if "auto_tts" in payload:
            event_payload["auto_tts"] = payload.get("auto_tts")
        return event_payload

    def _estimate_latency(self, end_time: float | None) -> int | None:
        if end_time is None:
            return None
        latency = int((self._audio_cursor - end_time) * 1000)
        return latency if latency >= 0 else 0

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    async def broadcast_audio(
        audio_iter: AsyncIterable[bytes],
        queues: list[asyncio.Queue],
        *,
        on_chunk: Optional[Callable[[bytes], None]] = None,
    ) -> None:
        """Broadcast audio to multiple queues."""
        try:
            async for chunk in audio_iter:
                if on_chunk:
                    try:
                        on_chunk(chunk)
                    except Exception:
                        LOGGER.debug("on_chunk callback failed", exc_info=True)
                for queue in queues:
                    await queue.put(chunk)
        finally:
            for queue in queues:
                await queue.put(None)

    @staticmethod
    def _merge_transcripts(previous: str, current: str) -> str:
        prev = (previous or "").strip()
        curr = (current or "").strip()
        if not prev:
            return curr
        if not curr:
            return prev
        if curr.startswith(prev):
            return curr
        if prev.endswith(curr):
            return prev
        if prev in curr:
            return curr
        return f"{prev} {curr}".strip()
