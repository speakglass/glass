"""ASR stream processing."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from typing import TYPE_CHECKING, AsyncIterable

if TYPE_CHECKING:
    from .ports import ASRPort

LOGGER = logging.getLogger(__name__)

# Regex for detecting CJK characters
_CJK_CHAR_PATTERN = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


class ASRProcessor:
    """Handle ASR stream consumption and processing."""

    def __init__(
        self,
        session_id: str,
        asr: ASRPort,
        emit_callback,
        handle_transcript_callback,
    ):
        self.session_id = session_id
        self.asr = asr
        self._emit = emit_callback
        self._handle_transcript = handle_transcript_callback
        
        # Track active utterance per source
        self._active_utterance_id: dict[str, str] = {}
        self._utterance_completed: dict[str, bool] = {}
        # Cache last final payload per source to trigger on utterance_end if needed
        self._last_final_payload: dict[str, dict] = {}
        # Accumulate final segments per active utterance (by source)
        self._utterance_segments: dict[str, list[dict]] = {}
        # Track latest partial per source to include on utterance_end
        self._last_partial: dict[str, dict] = {}

    async def consume_asr(
        self, 
        queue: asyncio.Queue, 
        *, 
        source: str, 
        language: str | None = None,
        event_type_transcript,
        event_type_partial,
        event_type_utterance_end,
    ) -> None:
        """Consume and process ASR events."""
        async def queue_iter():
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item

        # Resolve Deepgram config
        deepgram_language = None
        deepgram_model = None
        if language:
            try:
                from ..adapters.asr.language_config import get_deepgram_config
                config = get_deepgram_config(language)
                deepgram_language = config.deepgram_code
                deepgram_model = config.model
            except Exception:
                pass

        async for chunk in self.asr.stream(  # type: ignore[attr-defined]
            self.session_id,
            queue_iter(),
            source=source,
            language=deepgram_language,
            model=deepgram_model,
        ):
            chunk_source = chunk.get("source") or source
            event_name = chunk.get("event")

            # Utterance end
            if event_name == "utterance_end":
                utterance_id = self._active_utterance_id.get(chunk_source)
                payload = {k: v for k, v in chunk.items() if k in {"last_word_end", "channel"}}
                if utterance_id:
                    payload["utterance_id"] = utterance_id
                await self._emit(event_type_utterance_end, payload, source=chunk_source)
                # If we have accumulated segments (and optionally a trailing partial), trigger aggregated transcript handling
                try:
                    segments = self._utterance_segments.get(chunk_source) or []
                    if utterance_id and (segments or self._last_partial.get(chunk_source)):
                        full_text = " ".join([(s.get("text") or "").strip() for s in segments if (s.get("text") or "").strip()])
                        # Compute timing if available
                        starts = [s.get("start") for s in segments if isinstance(s.get("start"), (int, float))]
                        durations = [s.get("duration") for s in segments if isinstance(s.get("duration"), (int, float))]
                        agg_start = min(starts) if starts else None  # type: ignore[type-var]
                        agg_end = None
                        if starts and durations:
                            last_idx = max(range(len(segments)), key=lambda i: (segments[i].get("start") or 0))
                            last_start = segments[last_idx].get("start")
                            last_dur = segments[last_idx].get("duration")
                            if isinstance(last_start, (int, float)) and isinstance(last_dur, (int, float)) and isinstance(agg_start, (int, float)):
                                agg_end = last_start + last_dur
                        agg_duration = (agg_end - agg_start) if (agg_end is not None and isinstance(agg_start, (int, float))) else None
                        lang = None
                        for s in segments:
                            if s.get("lang"):
                                lang = s.get("lang")
                                break
                        # Append trailing partial if it belongs to this utterance and is not duplicate
                        trailing = self._last_partial.get(chunk_source)
                        if trailing and trailing.get("utterance_id") == utterance_id:
                            t_text = (trailing.get("text") or "").strip()
                            if t_text:
                                # Guard against duplication by time and text
                                p_start = trailing.get("start")
                                p_dur = trailing.get("duration")
                                should_append = True
                                # 1) If we have timing, only append if the partial extends beyond current agg_end
                                if isinstance(p_start, (int, float)) and isinstance(p_dur, (int, float)) and isinstance(agg_start, (int, float)) and isinstance(agg_duration, (int, float)):
                                    cur_end = agg_start + agg_duration
                                    end_candidate = p_start + p_dur
                                    # Allow tiny epsilon for float math
                                    if end_candidate <= (cur_end + 0.01):
                                        should_append = False
                                # 2) Also avoid appending if text already ends with the partial
                                if should_append and full_text and full_text.endswith(t_text):
                                    should_append = False
                                if should_append:
                                    full_text = f"{full_text} {t_text}" if full_text else t_text
                                    if isinstance(p_start, (int, float)) and isinstance(p_dur, (int, float)):
                                        if agg_start is None:
                                            agg_start = p_start
                                            agg_duration = p_dur
                                        else:
                                            end_candidate = p_start + p_dur
                                            if isinstance(agg_duration, (int, float)):
                                                cur_end = agg_start + agg_duration
                                                if end_candidate > cur_end:
                                                    agg_duration = end_candidate - agg_start
                                            else:
                                                agg_duration = end_candidate - agg_start
                        # Emit aggregated final transcript to clients so UI receives the complete utterance
                        aggregated_payload = {
                            "text": full_text,
                            "utterance_id": utterance_id,
                            "speech_final": True,
                            "is_final": True,
                        }
                        if agg_start is not None:
                            aggregated_payload["start"] = agg_start
                        if agg_duration is not None:
                            aggregated_payload["duration"] = agg_duration
                        if lang:
                            aggregated_payload["lang"] = lang
                        await self._emit(event_type_transcript, aggregated_payload, source=chunk_source)
                        await self._handle_transcript(
                            text=full_text,
                            lang=lang or "en",
                            source=chunk_source,
                            utterance_id=utterance_id,
                            start=agg_start,
                            duration=agg_duration,
                            speech_final=True,
                        )
                except Exception:
                    # Best effort; do not fail the stream on follow-up processing
                    pass
                finally:
                    # Clear cache for this source after utterance completion
                    self._last_final_payload.pop(chunk_source, None)
                    self._utterance_segments.pop(chunk_source, None)
                    self._last_partial.pop(chunk_source, None)
                self._utterance_completed[chunk_source] = True
                self._active_utterance_id.pop(chunk_source, None)
                continue

            # Partial transcript
            if chunk.get("partial"):
                utterance_id = self._active_utterance_id.get(chunk_source)
                if not utterance_id or self._utterance_completed.get(chunk_source, True):
                    utterance_id = str(uuid.uuid4())
                    self._active_utterance_id[chunk_source] = utterance_id
                    self._utterance_completed[chunk_source] = False
                text = (chunk.get("partial") or "").strip()
                if text:
                    partial_payload = {"text": text, "utterance_id": utterance_id}
                    if chunk.get("start") is not None:
                        partial_payload["start"] = chunk.get("start")
                    if chunk.get("duration") is not None:
                        partial_payload["duration"] = chunk.get("duration")
                    await self._emit(event_type_partial, partial_payload, source=chunk_source)
                    # Track latest partial for this source to include at utterance_end
                    self._last_partial[chunk_source] = {
                        "text": text,
                        "utterance_id": utterance_id,
                        "start": partial_payload.get("start"),
                        "duration": partial_payload.get("duration"),
                    }
                continue

            # Final transcript
            if chunk.get("final"):
                utterance_id = self._active_utterance_id.get(chunk_source)
                if not utterance_id:
                    utterance_id = str(uuid.uuid4())
                    self._active_utterance_id[chunk_source] = utterance_id
                    self._utterance_completed[chunk_source] = False
                payload = {
                    "text": (chunk.get("text") or "").strip(),
                    "utterance_id": utterance_id,
                }
                if chunk.get("is_final") is not None:
                    payload["is_final"] = chunk.get("is_final")
                if chunk.get("speech_final") is not None:
                    payload["speech_final"] = chunk.get("speech_final")
                if chunk.get("lang"):
                    payload["lang"] = chunk.get("lang")
                if chunk.get("start") is not None:
                    payload["start"] = chunk.get("start")
                if chunk.get("duration") is not None:
                    payload["duration"] = chunk.get("duration")
                if payload.get("text"):
                    # Accumulate segment for this utterance
                    segs = self._utterance_segments.setdefault(chunk_source, [])
                    segs.append({
                        "text": payload.get("text"),
                        "start": payload.get("start"),
                        "duration": payload.get("duration"),
                        "lang": payload.get("lang"),
                    })

                    await self._emit(event_type_transcript, payload, source=chunk_source)
                    # Call transcript handler; only trigger LLM when speech_final is True
                    speech_final = bool(payload.get("speech_final", False))
                    if speech_final:
                        # Build aggregated text/timing
                        segments = self._utterance_segments.get(chunk_source) or []
                        full_text = " ".join([(s.get("text") or "").strip() for s in segments if (s.get("text") or "").strip()])
                        starts = [s.get("start") for s in segments if isinstance(s.get("start"), (int, float))]
                        durations = [s.get("duration") for s in segments if isinstance(s.get("duration"), (int, float))]
                        agg_start = min(starts) if starts else payload.get("start")  # type: ignore[type-var]
                        agg_end = None
                        if starts and durations:
                            last_idx = max(range(len(segments)), key=lambda i: (segments[i].get("start") or 0))
                            last_start = segments[last_idx].get("start")
                            last_dur = segments[last_idx].get("duration")
                            if isinstance(last_start, (int, float)) and isinstance(last_dur, (int, float)) and isinstance(agg_start, (int, float)):
                                agg_end = last_start + last_dur
                        agg_duration = (agg_end - agg_start) if (agg_end is not None and isinstance(agg_start, (int, float))) else payload.get("duration")
                        lang = payload.get("lang")
                        if not lang:
                            for s in segments:
                                if s.get("lang"):
                                    lang = s.get("lang")
                                    break
                        await self._handle_transcript(
                            text=full_text,
                            lang=lang or "en",
                            source=chunk_source,
                            utterance_id=utterance_id,
                            start=agg_start,
                            duration=agg_duration,
                            speech_final=True,
                        )
                    else:
                        # Update transcript store without triggering LLM processing
                        await self._handle_transcript(
                            text=payload["text"],
                            lang=payload.get("lang", "en"),
                            source=chunk_source,
                            utterance_id=utterance_id,
                            start=payload.get("start"),
                            duration=payload.get("duration"),
                            speech_final=False,
                        )
                    # Cache last final payload for potential utterance_end trigger
                    self._last_final_payload[chunk_source] = dict(payload)
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


