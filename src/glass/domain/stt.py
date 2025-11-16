"""Speech-to-text transcription."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, AsyncIterable, Callable, Any

if TYPE_CHECKING:
    from .ports import ASRPort

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
        # Keep reference to last completed utterance to enrich UtteranceEnd events
        self._last_completed_utterance_id: dict[str, str] = {}

    async def process_stream(
        self, 
        queue: asyncio.Queue, 
        *, 
        source: str, 
        language: str | None = None,
        event_type_transcript,
        event_type_partial,
        event_type_utterance_end,
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
                return
            text = (pending.get("text") or "").strip()
            if not text:
                return

            payload = dict(pending)
            if not payload.get("speech_final"):
                payload["speech_final"] = True
                await self._emit(event_type_transcript, payload, source=source)
            utterance_id = payload.get("utterance_id")
            if utterance_id:
                self._last_completed_utterance_id[source] = utterance_id
            await self._handle_transcript(
                text=text,
                lang=payload.get("lang", "en"),
                source=source,
                utterance_id=utterance_id,
                start=payload.get("start"),
                duration=payload.get("duration"),
                speech_final=True,
            )
            self._active_utterance_id.pop(source, None)

        async for chunk in self.asr.stream(  # type: ignore[attr-defined]
            self.session_id,
            queue_iter(),
            source=source,
            language=language,
        ):
            chunk_source = chunk.get("source") or source
            event_name = chunk.get("event")

            # Utterance end - just emit and cleanup
            if event_name == "utterance_end":
                utterance_id = self._active_utterance_id.get(chunk_source) or self._last_completed_utterance_id.get(
                    chunk_source
                )
                await finalize_pending(chunk_source, reason="utterance_end")
                payload = {k: v for k, v in chunk.items() if k in {"last_word_end", "channel"}}
                if utterance_id:
                    payload["utterance_id"] = utterance_id
                await self._emit(event_type_utterance_end, payload, source=chunk_source)
                if utterance_id and self._last_completed_utterance_id.get(chunk_source) == utterance_id:
                    self._last_completed_utterance_id.pop(chunk_source, None)
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
                    partial_payload = {"text": text, "utterance_id": utterance_id}
                    if chunk.get("start") is not None:
                        partial_payload["start"] = chunk["start"]
                    if chunk.get("duration") is not None:
                        partial_payload["duration"] = chunk["duration"]
                    await self._emit(event_type_partial, partial_payload, source=chunk_source)
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
                if chunk.get("lang"):
                    payload["lang"] = chunk["lang"]
                if chunk.get("start") is not None:
                    payload["start"] = chunk["start"]
                if chunk.get("duration") is not None:
                    payload["duration"] = chunk["duration"]
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
                await self._emit(event_type_transcript, payload, source=chunk_source)

                # Track pending transcript until speech completion
                self._pending_transcripts[chunk_source] = payload
                if payload.get("speech_final"):
                    await finalize_pending(chunk_source, reason="speech_final")
                continue

    @staticmethod
    async def broadcast_audio(audio_iter: AsyncIterable[bytes], queues: list[asyncio.Queue]) -> None:
        """Broadcast audio to multiple queues."""
        try:
            async for chunk in audio_iter:
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
