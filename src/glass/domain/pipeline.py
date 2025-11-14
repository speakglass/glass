"""Session orchestration pipeline."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Any, AsyncIterable, Deque

from .asr_processor import ASRProcessor
from .entities import EventType, SessionEvent
from .llm_processor import LLMProcessor
from .ports import ASRPort, EventsPort, LLMPort, MemoryPort

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
        llm_semaphore: asyncio.Semaphore | None = None,
        context_window_size: int = 5,  # For LLM prompts (Zep best practice)
        default_lang: str = "en",
    ) -> None:
        self.session_id = session_id
        self.memory = memory
        self.events_ports: list[EventsPort] = [events] if events else []
        # Tail keeps recent messages for real-time LLM processing
        self.tail: Deque[dict] = deque(maxlen=context_window_size)
        self.default_lang = default_lang
        self.lang = default_lang
        self._llm_gate = llm_semaphore or asyncio.Semaphore(4)
        self.session_start_time = time.time()
        
        # Full conversation history (not limited like tail)
        self.full_conversation: list[dict] = []
        
        # Initialize processors
        self.asr_processor = ASRProcessor(
            session_id=session_id,
            asr=asr,
            emit_callback=self._emit,
            handle_transcript_callback=self._handle_transcript,
        )
        
        self.llm_processor = LLMProcessor(
            session_id=session_id,
            llm=llm,
            emit_callback=self._emit,
            llm_gate=self._llm_gate,
        )
        # Pass memory to LLM processor for context retrieval
        self.llm_processor.memory = memory
        self.llm_processor.user_id = None  # Will be set in WebSocket route
        # Set context window size (Zep best practice: 5 messages)
        self.llm_processor.context_window_size = context_window_size

    async def process_audio_stream(
        self,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str = "mixed",
    ) -> None:
        """Process an incoming audio stream."""
        asr_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=8)
        
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

        producer = asyncio.create_task(ASRProcessor.broadcast_audio(audio_iter, [asr_queue]))
        try:
            await asyncio.gather(producer, *tasks)
        except Exception:
            for task in tasks:
                task.cancel()
            producer.cancel()
            raise

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

        # Determine if this utterance came from the microphone (user) for downstream logic
        source_label = (source or "").lower()
        is_mic = bool(source_label == "mic" or source_label.startswith("mic_"))
        
        # Auto-assign speaker based on source if not explicitly provided
        if not speaker:
            if source and source == "mic":
                speaker = "user"
            elif source == "system":
                # Set speaker based on mode
                # Practice mode: system audio is not used (shouldn't happen)
                # Real Talk mode: system audio is from conversation partner
                mode = getattr(self.llm_processor, 'mode', 'real')
                speaker = "partner" if mode == "real" else "ai"
            elif source == "ai":
                speaker = "ai"
            else:
                # Fallback for unknown sources
                speaker = source or "unknown"

        if not is_mic and speaker == "user":
            is_mic = True
        
        msg: dict[str, Any] = {
            "speaker": speaker,
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
        # Note: Messages are automatically added to Zep at session end via add_conversation_messages()
        # This provides better context and allows Zep to extract facts/entities from full conversations
        # No need to persist individual utterances here
        
        # Trigger LLM processing only when speech is final (utterance complete)
        if speech_final:
            asyncio.create_task(self.llm_processor.process_utterance(
                text=text,
                utterance_id=utterance_id or "",
                source_lang=lang,
                source=source or "unknown",
                is_user=is_mic,
                event_type_translation=EventType.TRANSLATION,
                event_type_feedback=EventType.FEEDBACK,
                event_type_suggestion=EventType.SUGGESTION,
                event_type_transcript=EventType.TRANSCRIPT,
                tail=list(self.tail),
                start=start,
                duration=duration,
            ))

    async def _emit(
        self,
        event_type: EventType,
        payload: dict,
        *,
        source: str | None = None,
        speaker: str | None = None,
    ) -> None:
        # Persist important events into conversation storage for memory
        try:
            evt_source = (payload.get("source") if isinstance(payload, dict) else None) or source or None
            
            # Store AI conversation turns (practice mode)
            if event_type == EventType.TRANSCRIPT and evt_source == "ai":
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
            
            # Store Glass learning assistant feedback/suggestions for memory
            elif evt_source == "glass" and event_type in (EventType.FEEDBACK, EventType.SUGGESTION):
                msg_text = (payload.get("text") if isinstance(payload, dict) else None) or ""
                utterance_id = (payload.get("utterance_id") if isinstance(payload, dict) else None)
                glass_msg: dict = {
                    "speaker": "glass",
                    "source": "glass",
                    "text": msg_text,
                    "event_type": event_type.value,  # "feedback" or "suggestion"
                }
                if utterance_id:
                    glass_msg["utterance_id"] = utterance_id
                # Add to conversation history for Zep memory
                self.full_conversation.append(glass_msg)
                LOGGER.debug(f"[Memory] Stored Glass {event_type.value}: {msg_text[:50]}...")
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
    
    def set_suggest_length_mode(self, mode: str) -> None:
        """Set the suggestion length mode: 'auto', 'short' (1 sentence), or 'long' (4 sentences)."""
        self.llm_processor.suggest_length_mode = mode
        LOGGER.info(f"Session {self.session_id} suggest length mode set to: {mode}")

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
    
    # --- LLM-Related Methods (Delegated to LLMProcessor) -----------------
    async def generate_suggestion(self, user_hint: str | None = None) -> dict:
        """Generate a suggestion based on conversation context.
        
        Args:
            user_hint: Optional hint from user (e.g., keywords, partial sentence)
        
        Returns:
            dict with target_text, native_translation, pronunciation
        """
        LOGGER.info(f"[Manual Suggestion] Starting with length_mode={self.llm_processor.suggest_length_mode}")
        target_lang_name = self.llm_processor._lang_code_to_name(self.llm_processor.learning_lang)
        native_lang_name = self.llm_processor._lang_code_to_name(self.llm_processor.native_lang)
        
        # Get thread context for personalized suggestions
        thread_context = ""
        if self.llm_processor.memory and self.llm_processor.user_id:
            thread_context = await self.llm_processor.memory.get_context_for_prompt(
                thread_id=self.session_id,
                user_id=self.llm_processor.user_id,
                scope="thread",
                timeout=2.0,
            )
        
        result = await self.llm_processor.llm.suggest(
            recent_conversation=self.llm_processor._get_recent_conversation(list(self.tail)),
            target_lang=target_lang_name,
            native_lang=native_lang_name,
            user_hint=user_hint,
            user_context=self.llm_processor.user_context_block,
            thread_context=thread_context,
            length_mode=self.llm_processor.suggest_length_mode,
        )
        
        if result:
            # Ensure pronunciation if needed
            suggestion = await self.llm_processor._ensure_pronunciation(result)
            return suggestion
        return {"target_text": ""}

    async def analyze_conversation(self) -> dict:
        """Analyze the full conversation and return scores, extracted info, and overall feedback."""
        return await self.llm_processor.analyze_conversation(
            self.full_conversation,
            self.llm_processor.all_feedback,
            self.llm_processor.native_lang,
            self.llm_processor.learning_lang,
        )
