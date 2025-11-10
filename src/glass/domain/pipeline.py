"""Session orchestration pipeline."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import AsyncIterable, Deque, Sequence

from .asr_processor import ASRProcessor
from .entities import EventType, SessionEvent
from .llm_processor import LLMProcessor
from .ports import ASRPort, DiarizationPort, EventsPort, LLMPort, MemoryPort, VisionPort

LOGGER = logging.getLogger(__name__)


class SessionPipeline:
    """Coordinate ASR, memory, and LLM interactions for a live session."""

    def __init__(
        self,
        session_id: str,
        *,
        asr: ASRPort,
        llm: LLMPort,
        memory: MemoryPort,
        events: EventsPort | None,
        vision: VisionPort | None = None,
        diarizer: DiarizationPort | None = None,
        llm_semaphore: asyncio.Semaphore | None = None,
        tail_size: int = 12,
        default_lang: str = "en",
        default_tone: str = "neutral",
    ) -> None:
        self.session_id = session_id
        self.memory = memory
        self.events_ports: list[EventsPort] = [events] if events else []
        self.vision = vision
        self.tail: Deque[dict] = deque(maxlen=tail_size)
        self.default_lang = default_lang
        self.default_tone = default_tone
        self.screen_hint: str | None = None
        self.lang = default_lang
        self._llm_gate = llm_semaphore or asyncio.Semaphore(4)
        self.session_start_time = time.time()
        
        # Full conversation history (not limited like tail)
        self.full_conversation: list[dict] = []
        
        # Initialize processors
        self.asr_processor = ASRProcessor(
            session_id=session_id,
            asr=asr,
            diarizer=diarizer,
            emit_callback=self._emit,
            handle_transcript_callback=self._handle_transcript,
        )
        
        self.llm_processor = LLMProcessor(
            session_id=session_id,
            llm=llm,
            emit_callback=self._emit,
            llm_gate=self._llm_gate,
        )

    async def process_audio_stream(
        self,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str = "mixed",
        enable_diarization: bool | None = None,
    ) -> None:
        """Process an incoming audio stream with optional per-source diarization."""
        queues: list[asyncio.Queue] = []
        asr_queue = asyncio.Queue(maxsize=8)
        queues.append(asr_queue)
        
        tasks = [
            asyncio.create_task(
                self.asr_processor.consume_asr(
                    asr_queue, 
                    source=source, 
                    language=self.llm_processor.learning_lang,
                    event_type_transcript=EventType.TRANSCRIPT,
                    event_type_partial=EventType.PARTIAL_TRANSCRIPT,
                    event_type_utterance_end=EventType.UTTERANCE_END,
                )
            )
        ]
        
        use_diarization = (
            bool(enable_diarization)
            if enable_diarization is not None
            else self.asr_processor.diarizer is not None
        )
        if use_diarization and self.asr_processor.diarizer is not None:
            diar_queue = asyncio.Queue(maxsize=8)
            queues.append(diar_queue)
            tasks.append(asyncio.create_task(
                self.asr_processor.consume_diarizer(
                    diar_queue, 
                    source=source,
                    event_type_speaker_activity=EventType.SPEAKER_ACTIVITY,
                )
            ))

        producer = asyncio.create_task(ASRProcessor.broadcast_audio(audio_iter, queues))
        try:
            await asyncio.gather(producer, *tasks)
        except Exception:
            for task in tasks:
                task.cancel()
            producer.cancel()
            raise

    async def handle_text_query(self, text: str, tone: str | None = None, lang: str | None = None) -> dict:
        """Handle an explicit text query (e.g. POST /ask)."""
        tone = tone or self.default_tone
        lang = lang or self.lang
        msg = {"speaker": "user", "source": "manual", "text": text}
        self.tail.append(msg)
        self.full_conversation.append(msg)
        context = await self.memory.retrieve(self.session_id, text, k=6)
        suggestion = await self._generate_suggestion(context=context, tone=tone, lang=lang)
        await self._persist_interaction(text=text, suggestion=suggestion, tone=tone, speaker=None)
        await self._emit(EventType.SUGGESTION, suggestion)
        return suggestion

    async def handle_screen_hint(self, text: str, app: str | None = None) -> None:
        """Update the active screen hint context."""
        self.screen_hint = text
        await self.memory.upsert(
            nodes=[
                {
                    "type": "screen",
                    "session_id": self.session_id,
                    "text": text,
                    "app": app,
                }
            ],
            edges=None,
        )

    async def handle_image(self, blob_id: str, mime_type: str, *, local_path: str | None = None) -> None:
        """Persist an image reference and optionally run a vision adapter."""
        image_node = {
            "type": "image",
            "session_id": self.session_id,
            "blob_id": blob_id,
            "mime": mime_type,
            "local_path": local_path,
        }
        description: str | None = None
        if self.vision is not None:
            description = await self.vision.describe(
                session_id=self.session_id,
                image_ref=image_node,
            )
            if description:
                await self._emit(
                    EventType.NOTE,
                    {"text": description, "source": "vision"},
                )
        store_node = dict(image_node)
        store_node.pop("local_path", None)
        await self.memory.upsert(nodes=[store_node], edges=None)
        if description:
            await self.memory.upsert(
                nodes=[
                    {
                        "type": "note",
                        "session_id": self.session_id,
                        "text": description,
                    }
                ],
                edges=[("image", "supports", "note")],
            )

    async def _handle_transcript(
        self,
        text: str,
        lang: str,
        *,
        speaker: str | None = None,
        source: str | None = None,
        utterance_id: str | None = None,
        start: float | None = None,
        duration: float | None = None,
        speech_final: bool = False,
    ) -> None:
        if not text:
            return
        speaker_label = self._label_for_speaker(source, speaker)
        # Determine if this is from user (mic) or remote (system)
        is_mic = source and (source == "mic" or source.startswith("mic_"))
        role = "user" if is_mic else "remote"
        msg = {
            "speaker": speaker_label or role,
            "source": source or "unknown",
            "text": text,
            "utterance_id": utterance_id,
        }
        if start is not None:
            msg["start"] = start
        if duration is not None:
            msg["duration"] = duration
        
        # For tail: upsert by (utterance_id, source) to avoid duplicate fragments of the same utterance
        # Keep order by replacing in place when possible; append if new.
        if utterance_id:
            existing_idx = None
            for idx, tmsg in enumerate(self.tail):
                if tmsg.get("utterance_id") == utterance_id and tmsg.get("source") == (source or "unknown"):
                    existing_idx = idx
                    break
            if existing_idx is not None:
                # Replace existing entry with latest message
                try:
                    self.tail[existing_idx] = msg
                except Exception:
                    # Fallback: append if deque does not support item assignment in this environment
                    self.tail.append(msg)
            else:
                self.tail.append(msg)
        else:
            self.tail.append(msg)
        
        # For full_conversation: update existing message with same utterance_id, or append if new
        if utterance_id:
            existing_idx = None
            for idx, conv_msg in enumerate(self.full_conversation):
                if conv_msg.get("utterance_id") == utterance_id and conv_msg.get("source") == source:
                    existing_idx = idx
                    break
            
            if existing_idx is not None:
                # Update existing message with latest text
                self.full_conversation[existing_idx] = msg
            else:
                # New utterance
                self.full_conversation.append(msg)
        else:
            # No utterance_id, append as-is
            self.full_conversation.append(msg)
        
        self.lang = lang or self.lang
        # Store context but don't auto-generate suggestion
        context = await self.memory.retrieve(self.session_id, text, k=6)
        await self._persist_interaction(
            text=text,
            suggestion=None,  # No auto-suggestion
            tone=self.default_tone,
            speaker=speaker_label,
        )
        
        # Trigger LLM processing only when speech is final (utterance complete)
        if speech_final:
            asyncio.create_task(self.llm_processor.translate_and_emit(
                text=text,
                utterance_id=utterance_id or "",
                source_lang=lang,
                source=source or "unknown",
                is_user=is_mic,
                event_type_translation=EventType.TRANSLATION,
                event_type_feedback=EventType.FEEDBACK,
                event_type_answer=EventType.ANSWER,
                event_type_follow_up=EventType.FOLLOW_UP,
                event_type_transcript=EventType.TRANSCRIPT,
                tail=list(self.tail),
                start=start,
                duration=duration,
            ))

    async def _generate_suggestion(self, context: Sequence[dict], tone: str, lang: str) -> dict:
        # Access LLM through processor
        try:
            # Compact preview of tail for debugging suggest behavior
            preview_lines: list[str] = []
            for entry in list(self.tail)[-8:]:
                if isinstance(entry, dict):
                    src = entry.get("source", "?")
                    spk = entry.get("speaker", "?")
                    txt = (entry.get("text", "") or "").replace("\n", " ")
                    if len(txt) > 200:
                        txt = txt[:200] + "…"
                    preview_lines.append(f"[{src}|{spk}] {txt}")
                else:
                    preview_lines.append(str(entry))

            print(f"[Suggest Tail] lang: {lang} tone: {tone} preview lines: {preview_lines}")
            LOGGER.info(
                "[Suggest Tail] lang=%s tone=%s\n%s",
                lang,
                tone,
                "\n".join(preview_lines) or "(empty tail)",
            )
        except Exception:
            pass
        raw = await self.llm_processor.llm.suggest(
            transcript_tail=list(self.tail),
            screen=self.screen_hint,
            memory=context,
            tone=tone,
            lang=lang,
        )
        if isinstance(raw, str):
            return {"text": raw, "tone": tone, "notes": []}
        merged = {"tone": tone, "notes": []}
        merged.update(raw)
        merged.setdefault("text", "")
        merged.setdefault("notes", [])
        return merged

    async def _persist_interaction(
        self,
        text: str,
        suggestion: dict | None,
        tone: str,
        speaker: str | None,
    ) -> None:
        nodes = [
            {
                "type": "utterance",
                "session_id": self.session_id,
                "text": text,
                "tone": tone,
            },
        ]
        if speaker:
            nodes[0]["speaker"] = speaker
        
        edges = []
        
        # Only add suggestion and notes if a suggestion was provided
        if suggestion is not None:
            nodes.append({
                "type": "suggestion",
                "session_id": self.session_id,
                "text": suggestion.get("text", ""),
                "tone": suggestion.get("tone", tone),
            })
            edges.append(("utterance", "supports", "suggestion"))
            
            notes = suggestion.get("notes") or []
            for note_text in notes:
                nodes.append(
                    {
                        "type": "note",
                        "session_id": self.session_id,
                        "text": note_text,
                    }
                )
                edges.append(("suggestion", "supports", "note"))
        
        await self.memory.upsert(nodes=nodes, edges=edges)

    async def _emit(
        self,
        event_type: EventType,
        payload: dict,
        *,
        source: str | None = None,
        speaker: str | None = None,
    ) -> None:
        # Persist AI transcript events into conversation storage (practice mode AI turns)
        try:
            if event_type == EventType.TRANSCRIPT:
                evt_source = (payload.get("source") if isinstance(payload, dict) else None) or source or None
                if evt_source == "ai":
                    msg_text = (payload.get("text") if isinstance(payload, dict) else None) or ""
                    utterance_id = (payload.get("utterance_id") if isinstance(payload, dict) else None)
                    msg: dict = {
                        "speaker": speaker or "ai",
                        "source": "ai",
                        "text": msg_text,
                        "utterance_id": utterance_id,
                    }
                    # Optional timing
                    if isinstance(payload, dict):
                        if payload.get("start") is not None:
                            msg["start"] = payload.get("start")
                        if payload.get("duration") is not None:
                            msg["duration"] = payload.get("duration")
                    # Upsert into full_conversation
                    if utterance_id:
                        existing_idx = None
                        for idx, conv_msg in enumerate(self.full_conversation):
                            if conv_msg.get("utterance_id") == utterance_id and conv_msg.get("source") == "ai":
                                existing_idx = idx
                                break
                        if existing_idx is not None:
                            self.full_conversation[existing_idx] = msg
                        else:
                            self.full_conversation.append(msg)
                    else:
                        self.full_conversation.append(msg)
                    # Upsert into tail
                    if utterance_id:
                        existing_idx = None
                        for idx, tmsg in enumerate(self.tail):
                            if tmsg.get("utterance_id") == utterance_id and tmsg.get("source") == "ai":
                                existing_idx = idx
                                break
                        if existing_idx is not None:
                            try:
                                self.tail[existing_idx] = msg
                            except Exception:
                                self.tail.append(msg)
                        else:
                            self.tail.append(msg)
                    else:
                        self.tail.append(msg)
        except Exception:
            # Do not let persistence errors block event delivery
            pass

        if not self.events_ports:
            return
        enriched = dict(payload)
        if source is not None and "source" not in enriched:
            enriched["source"] = source
        if speaker is not None and "speaker" not in enriched:
            enriched["speaker"] = speaker
        event = SessionEvent(type=event_type, session_id=self.session_id, payload=enriched)
        # Broadcast to all connected WebSockets
        await asyncio.gather(
            *[port.send(event) for port in self.events_ports],
            return_exceptions=True,
        )

    def attach_events(self, events: EventsPort | None) -> None:
        """Add an additional events port (e.g. when a new WebSocket connects)."""
        if events is not None and events not in self.events_ports:
            self.events_ports.append(events)
    
    def detach_events(self, events: EventsPort) -> None:
        """Remove an events port (e.g. when a WebSocket disconnects)."""
        if events in self.events_ports:
            self.events_ports.remove(events)

    # --- Configuration Methods -------------------------------------------
    def set_feedback_mode(self, mode: str) -> None:
        """Set the feedback mode: 'always', 'auto', or 'off'."""
        self.llm_processor.feedback_mode = mode
        LOGGER.info(f"Session {self.session_id} feedback mode set to: {mode}")
    
    def set_suggest_mode(self, mode: str) -> None:
        """Set the suggestion mode: 'always', 'auto', or 'off'."""
        self.llm_processor.suggest_mode = mode
        LOGGER.info(f"Session {self.session_id} suggest mode set to: {mode}")

    def set_user_profile(self, proficiency: str | None, pronunciation_mode: str | None = None) -> None:
        """Set user profile (proficiency and pronunciation mode)."""
        self.llm_processor.proficiency = proficiency
        if pronunciation_mode is not None:
            self.llm_processor.pronunciation_mode = pronunciation_mode
        LOGGER.info(f"Session {self.session_id} profile updated: proficiency={proficiency}, pronunciation_mode={pronunciation_mode}")
    
    def set_session_config(self, learning_lang: str, native_lang: str, mode: str, scenario: str | None = None) -> None:
        """Set session configuration including languages, mode, and scenario."""
        self.llm_processor.learning_lang = learning_lang
        self.llm_processor.native_lang = native_lang
        self.llm_processor.mode = mode
        self.llm_processor.scenario = scenario
        LOGGER.info(f"Session {self.session_id} config - learning: {learning_lang}, native: {native_lang}, mode: {mode}, scenario: {scenario}")
    

    async def _generate_initial_greeting(self) -> None:
        """Generate initial AI greeting in practice mode."""
        ai_msg = await self.llm_processor.generate_initial_greeting(
            list(self.tail),
            self.full_conversation,
            EventType.TRANSCRIPT,
            EventType.TRANSLATION,
            EventType.ANSWER,
        )

    # --- LLM-Related Methods (Delegated to LLMProcessor) -----------------
    async def generate_answer(self) -> dict:
        """Generate a structured answer suggestion based on conversation history."""
        return await self.llm_processor.generate_answer(list(self.tail), self.lang)

    async def generate_follow_up(self) -> dict:
        """Generate a structured follow-up suggestion based on conversation history."""
        return await self.llm_processor.generate_follow_up(list(self.tail), self.lang)

    async def generate_suggestion(self) -> tuple[str, dict]:
        """Generate a unified suggestion (answer or follow-up) based on conversation context.
        
        Returns:
            A tuple of (suggestion_type, suggestion_dict) where suggestion_type is 'answer' or 'follow_up'
        """
        return await self.llm_processor.generate_suggestion(list(self.tail), self.lang)

    async def translate_input(self, text: str) -> dict:
        """Translate user input (keywords or sentence) to target language.
        
        Args:
            text: User input to translate
        
        Returns:
            dict with target_text, native_translation, pronunciation
        """
        return await self.llm_processor.translate_input(text, list(self.tail))

    async def analyze_conversation(self) -> dict:
        """Analyze the full conversation and return scores, extracted info, and overall feedback."""
        return await self.llm_processor.analyze_conversation(
            self.full_conversation,
            self.llm_processor.all_feedback,
            self.llm_processor.native_lang,
            self.llm_processor.learning_lang,
        )

    @staticmethod
    def _label_for_speaker(source: str | None, speaker: str | None) -> str | None:
        if speaker and source:
            if speaker.startswith(source):
                return speaker
            return f"{source}:{speaker}"
        return speaker or source
