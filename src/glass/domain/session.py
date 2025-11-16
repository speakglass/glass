"""Conversation session orchestration."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncIterable

from .stt import SpeechRecognition
from .roleplay import Roleplay
from .entities import EventType, SessionEvent
from .assistant import LearningAssistant
from .memory import ConversationMemory
from .tts import SpeechSynthesis
from .ports import ASRPort, EventsPort, LLMPort, MemoryPort, TTSPort
from ..utils.language import lang_code_to_name

LOGGER = logging.getLogger(__name__)


class ConversationSession:
    """Coordinate ASR, memory, and LLM interactions for a live session."""

    def __init__(
        self,
        session_id: str,
        *,
        asr: ASRPort,
        llm: LLMPort,
        memory: MemoryPort,
        tts: TTSPort | None = None,
        events: EventsPort | None,
        llm_semaphore: asyncio.Semaphore | None = None,
        context_window_size: int = 5,  # For LLM prompts (Zep best practice)
        default_lang: str = "en",
    ) -> None:
        self.session_id = session_id
        self.events_ports: list[EventsPort] = [events] if events else []
        self.default_lang = default_lang
        self.lang = default_lang
        self._llm_gate = llm_semaphore or asyncio.Semaphore(4)
        self.session_start_time = time.time()
        self.mode: str = "live_call"  # "live_call" or "roleplay"
        self._active_roleplay_task: asyncio.Task | None = None
        
        # Initialize processors
        self.speech_recognition = SpeechRecognition(
            session_id=session_id,
            asr=asr,
            emit_callback=self._emit,
            handle_transcript_callback=self._handle_transcript,
            speech_activity_callback=self._handle_speech_activity,
        )
        
        self.assistant = LearningAssistant(
            session_id=session_id,
            llm=llm,
            emit_callback=self._emit,
            llm_gate=self._llm_gate,
        )
        
        self.memory = ConversationMemory(
            session_id=session_id,
            memory=memory,
            context_window_size=context_window_size,
        )
        self.memory_thread_id: str = session_id
        self.memory.set_thread_id(self.memory_thread_id)
        
        self.roleplay = Roleplay(
            session_id=session_id,
            llm=llm,
            emit_callback=self._emit,
        )
        self.roleplay.contact_id = None
        self.partner_profile: dict[str, Any] | None = None
        self.partner_id: str | None = None
        self.user_profile: dict[str, Any] | None = None
        
        # TTS processor (optional)
        self.synthesis: TTSProcessor | None = None
        if tts:
            from ..config import get_settings
            settings = get_settings()
            self.synthesis = SpeechSynthesis(
                session_id=session_id,
                tts=tts,
                default_voice_id=getattr(settings, "elevenlabs_voice_id", None),
                ai_voice_id=getattr(settings, "elevenlabs_ai_voice_id", None),
            )

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
                self.speech_recognition.process_stream(
                    asr_queue, 
                    source=source, 
                    language=self.assistant.learning_lang,
                    event_type_transcript=EventType.TRANSCRIPT,
                    event_type_partial=EventType.PARTIAL_TRANSCRIPT,
                    event_type_utterance_end=EventType.UTTERANCE_END,
                )
            )
        ]

        producer = asyncio.create_task(SpeechRecognition.broadcast_audio(audio_iter, [asr_queue]))
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
                # Roleplay mode: system audio is not used (shouldn't happen)
                # Live Call mode: system audio is from conversation partner
                speaker = "partner" if self.mode == "live_call" else "ai"
            elif source == "ai":
                speaker = "ai"
            else:
                # Fallback for unknown sources
                speaker = source or "unknown"

        if not is_mic and speaker == "user":
            is_mic = True
        
        metadata = self._build_message_identity(is_user=is_mic, speaker=speaker, source=source)
        memory_msg = self._format_memory_message(
            text=text,
            language=lang,
            metadata=metadata,
            utterance_id=utterance_id,
        )
        self.memory.upsert_message(memory_msg)
        
        self.lang = lang or self.lang
        
        # Trigger LLM processing only when speech is final (utterance complete)
        if speech_final:
            asyncio.create_task(self._process_final_utterance(
                text=text,
                utterance_id=utterance_id or "",
                source_lang=lang,
                source=source or "unknown",
                is_user=is_mic,
                start=start,
                duration=duration,
            ))

    async def _process_final_utterance(
        self,
        text: str,
        utterance_id: str,
        source_lang: str,
        source: str,
        is_user: bool,
        start: float | None,
        duration: float | None,
    ) -> None:
        """Process final utterance (orchestrates memory, LLM, and roleplay)."""
        # Get context from memory processor
        user_context, thread_context = await self.memory.get_hybrid_context()
        recent_conversation = self.memory.get_recent_conversation()
        
        # Process with LLM (translation, feedback, suggestions)
        await self.assistant.process_utterance(
            text=text,
            utterance_id=utterance_id,
            source_lang=source_lang,
            source=source,
            is_user=is_user,
            event_type_translation=EventType.TRANSLATION,
            event_type_feedback=EventType.FEEDBACK,
            event_type_suggestion=EventType.SUGGESTION,
            recent_conversation=recent_conversation,
            user_context=user_context,
            thread_context=thread_context,
        )
        
        # Practice mode: AI conversation partner
        if self.mode == 'roleplay' and is_user:
            user_message_end_time = None
            if start is not None and duration is not None:
                user_message_end_time = start + duration
            
            # Generate AI response
            self._cancel_roleplay_response("new_user_turn")
            self._active_roleplay_task = asyncio.create_task(
                self.roleplay.emit_ai_turn(
                    user_text=text,
                    user_utterance_id=utterance_id,
                    event_type_transcript=EventType.TRANSCRIPT,
                    event_type_translation=EventType.TRANSLATION,
                    recent_conversation=recent_conversation,
                    user_context=user_context,
                    thread_context=thread_context,
                    user_message_end_time=user_message_end_time,
                )
            )
            try:
                ai_msg = await self._active_roleplay_task
            except asyncio.CancelledError:
                LOGGER.info("[Roleplay] AI response cancelled for utterance %s", utterance_id)
                return
            finally:
                self._active_roleplay_task = None
            
            # Store AI message and generate suggestion
            if ai_msg:
                partner_label = (self.partner_profile or {}).get("name") or "partner"
                metadata = self._build_message_identity(is_user=False, speaker=partner_label, source="ai")
                translation_val = ai_msg.get("translation")
                extra: dict[str, Any] | None = None
                if translation_val:
                    extra = {"translation": translation_val}
                ai_memory_msg = self._format_memory_message(
                    text=ai_msg.get("text", ""),
                    language=self.assistant.learning_lang,
                    metadata=metadata,
                    utterance_id=ai_msg.get("utterance_id"),
                    extra=extra,
                )
                self.memory.upsert_message(ai_memory_msg)
                
                # Suggest response after AI turn (if enabled)
                if self.assistant.suggest_mode != 'off':
                    augmented_conversation = recent_conversation + [ai_msg]
                    ai_utt_id = ai_msg.get("utterance_id") or utterance_id
                    asyncio.create_task(
                        self.assistant.emit_suggestion(
                            utterance_id=ai_utt_id,
                            event_type=EventType.SUGGESTION,
                            recent_conversation=augmented_conversation,
                            user_context=user_context,
                            thread_context=thread_context,
                        )
                    )

    async def _emit(
        self,
        event_type: EventType,
        payload: dict,
        *,
        source: str | None = None,
        speaker: str | None = None,
    ) -> None:
        """Emit event and persist to memory if needed."""
        # Persist important events into conversation storage for memory
        try:
            if event_type == EventType.TRANSLATION and isinstance(payload, dict):
                self.memory.attach_translation(
                    payload.get("utterance_id"),
                    payload.get("text"),
                )
            evt_source = (payload.get("source") if isinstance(payload, dict) else None) or source or None
            
            # Store Glass learning assistant feedback/suggestions for memory
            if evt_source == "glass" and event_type in (EventType.FEEDBACK, EventType.SUGGESTION):
                msg_text = (payload.get("text") if isinstance(payload, dict) else None) or ""
                utterance_id = (payload.get("utterance_id") if isinstance(payload, dict) else None)
                metadata = self._build_message_identity(is_user=False, speaker="glass", source="glass")
                glass_msg = self._format_memory_message(
                    text=msg_text,
                    language=self.assistant.native_lang,
                    metadata=metadata,
                    utterance_id=utterance_id,
                    extra={"kind": event_type.value},
                )
                # Glass messages are append-only (no updates)
                self.memory.append_glass_message(glass_msg)
                LOGGER.debug(f"[Memory] Stored Glass {event_type.value}: {msg_text[:50]}...")
                
                # Track feedback for roleplay context
                if event_type == EventType.FEEDBACK:
                    self.roleplay.add_feedback(msg_text)
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

    def _handle_speech_activity(self, source: str) -> None:
        """Cancel AI responses if the user interrupts during roleplay."""
        if self.mode != "roleplay":
            return
        normalized = (source or "").lower()
        if normalized == "mic" or normalized.startswith("mic"):
            self._cancel_roleplay_response("user_activity")

    def _cancel_roleplay_response(self, reason: str) -> None:
        task = self._active_roleplay_task
        if task and not task.done():
            LOGGER.info("[Roleplay] Cancelling active response (%s)", reason)
            task.cancel()
        self._active_roleplay_task = None

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
        self.assistant.feedback_mode = mode
        LOGGER.info(f"Session {self.session_id} feedback mode set to: {mode}")
    
    def set_suggest_mode(self, mode: str) -> None:
        """Set the suggestion mode: 'always', 'auto', or 'off'."""
        self.assistant.suggest_mode = mode
        LOGGER.info(f"Session {self.session_id} suggest mode set to: {mode}")
    
    def set_suggest_length_mode(self, mode: str) -> None:
        """Set the suggestion length mode: 'auto', 'short' (1 sentence), or 'long' (4 sentences)."""
        self.assistant.suggest_length_mode = mode
        LOGGER.info(f"Session {self.session_id} suggest length mode set to: {mode}")
    
    def _build_message_identity(self, *, is_user: bool, speaker: str | None = None, source: str | None = None) -> dict[str, Any]:
        def _normalize_id(value: Any) -> Any:
            return value.lower() if isinstance(value, str) else value

        normalized_source = (source or "").lower()
        normalized_speaker = (speaker or "").lower()
        if normalized_source == "glass" or normalized_speaker == "glass":
            return {"role": "assistant"}
        if is_user:
            return {"role": "user"}

        # Default to roleplay/live-call partner identity
        partner_profile = self.partner_profile or {}
        partner_id = self.partner_id or partner_profile.get("id") or f"partner:{self.session_id}"
        partner_name = partner_profile.get("name")
        metadata: dict[str, Any] = {"role": "partner"}
        if partner_id:
            metadata["partner_id"] = _normalize_id(partner_id)
        if partner_name:
            metadata["partner_name"] = partner_name
        return metadata

    def _format_memory_message(
        self,
        *,
        text: str,
        language: str | None,
        metadata: dict[str, Any],
        utterance_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "role": metadata.get("role", "partner"),
            "text": text,
            "language": (language or self.assistant.learning_lang or self.default_lang).lower(),
            "timestamp": time.time(),
            "mode": self.mode,
        }
        if metadata.get("partner_id"):
            entry["partner_id"] = metadata["partner_id"]
        if metadata.get("partner_name"):
            entry["partner_name"] = metadata["partner_name"]
        if utterance_id:
            entry["utterance_id"] = utterance_id
        if extra:
            entry.update(extra)
        return entry

    def set_user_profile(self, proficiency: str | None, pronunciation_mode: str | None = None) -> None:
        """Set user profile (proficiency and pronunciation mode)."""
        self.assistant.proficiency = proficiency
        if pronunciation_mode is not None:
            self.assistant.pronunciation_mode = pronunciation_mode
        LOGGER.info(f"Session {self.session_id} profile updated: proficiency={proficiency}, pronunciation_mode={pronunciation_mode}")
    
    def set_session_config(
        self,
        learning_lang: str,
        native_lang: str,
        mode: str,
        partner: dict[str, Any] | None = None,
    ) -> None:
        """Set session configuration including languages, mode, and contact info."""
        self.assistant.learning_lang = learning_lang
        self.assistant.native_lang = native_lang
        self.roleplay.learning_lang = learning_lang
        self.roleplay.native_lang = native_lang
        self.mode = mode
        self.assistant.mode = mode
        self.partner_profile = partner
        self.partner_id = partner.get("id") if isinstance(partner, dict) else None
        self.roleplay.contact_id = self.partner_id
        
        if partner:
            self.roleplay.contact_name = partner.get("name")
            self.roleplay.contact_description = partner.get("description")
            self.roleplay.contact_voice_id = partner.get("voice_id")
        elif mode == "live_call":
            placeholder_id = f"live:{self.session_id}"
            self.partner_profile = {
                "id": placeholder_id,
                "name": "Partner",
                "description": None,
                "avatar_url": None,
                "voice_id": None,
                "learning_lang": learning_lang,
                "native_lang": native_lang,
                "is_system": False,
            }
            self.partner_id = placeholder_id
            self.roleplay.contact_name = None
            self.roleplay.contact_description = None
            self.roleplay.contact_voice_id = None
        else:
            default_partner_id = self.partner_id or f"roleplay:{self.session_id}"
            self.partner_profile = {
                "id": default_partner_id,
                "name": "Partner",
                "description": None,
                "avatar_url": None,
                "voice_id": None,
                "learning_lang": learning_lang,
                "native_lang": native_lang,
                "is_system": False,
            }
            self.partner_id = default_partner_id
            self.roleplay.contact_id = default_partner_id
            self.roleplay.contact_name = "Partner"
            self.roleplay.contact_description = None
            self.roleplay.contact_voice_id = None
        
        if self.memory.user_id and self.partner_id:
            self.memory_thread_id = f"user:{self.memory.user_id}:partner:{self.partner_id}"
        else:
            self.memory_thread_id = self.session_id
        self.memory.set_thread_id(self.memory_thread_id)

        LOGGER.info(
            f"Session {self.session_id} config - learning: {learning_lang}, native: {native_lang}, "
            f"mode: {mode}, contact: {self.roleplay.contact_name} ({self.roleplay.contact_description})"
        )

    def build_participant_snapshot(self) -> dict[str, Any] | None:
        if not self.partner_profile and not self.user_profile:
            return None
        snapshot: dict[str, Any] = {}
        if self.partner_profile:
            snapshot["partner"] = {
                "id": self.partner_profile.get("id"),
                "name": self.partner_profile.get("name"),
                "description": self.partner_profile.get("description"),
                "avatar_url": self.partner_profile.get("avatar_url"),
                "voice_id": self.partner_profile.get("voice_id"),
                "learning_lang": self.partner_profile.get("learning_lang"),
                "native_lang": self.partner_profile.get("native_lang"),
                "is_system": self.partner_profile.get("is_system", False),
            }
        if self.user_profile:
            snapshot["user"] = {
                "id": self.user_profile.get("id"),
                "name": self.user_profile.get("name"),
                "email": self.user_profile.get("email"),
            }
        snapshot["session"] = {
            "mode": self.mode,
            "learning_lang": self.assistant.learning_lang,
            "native_lang": self.assistant.native_lang,
        }
        return snapshot
    
    # --- LLM-Related Methods (Delegated to LLMProcessor) -----------------
    async def generate_suggestion(self, user_hint: str | None = None) -> dict:
        """Generate a suggestion based on conversation context.
        
        Args:
            user_hint: Optional hint from user (e.g., keywords, partial sentence)
        
        Returns:
            dict with target_text, native_translation, pronunciation
        """
        LOGGER.info(f"[Manual Suggestion] Starting with length_mode={self.assistant.suggest_length_mode}")
        
        # Get context from memory processor
        user_context, thread_context = await self.memory.get_hybrid_context()
        recent_conversation = self.memory.get_recent_conversation()
        
        # Generate suggestion via LLM processor (without emitting)
        target_lang_name = lang_code_to_name(self.assistant.learning_lang)
        native_lang_name = lang_code_to_name(self.assistant.native_lang)
        
        # Build and call LLM directly
        from . import prompts
        import json
        
        recent_conv_texts = [msg.get("text", "") for msg in recent_conversation]
        system_prompt, user_prompt = prompts.build_suggestion_prompt(
            target_lang=target_lang_name,
            native_lang=native_lang_name,
            user_hint=user_hint,
            recent_conversation=recent_conv_texts,
            user_context=user_context,
            thread_context=thread_context,
            length_mode=self.assistant.suggest_length_mode,
        )
        
        response = await self.assistant.llm.call(
            prompt=user_prompt,
            system=system_prompt,
            temperature=0.7,
            max_tokens=500,
            json_mode=True,
        )
        
        result = json.loads(response) if response else None
        
        if result:
            # Ensure pronunciation if needed
            suggestion = await self.assistant._ensure_pronunciation(result)
            return suggestion
        return {"target_text": ""}

    async def analyze_conversation(self) -> dict:
        """Analyze the full conversation and return scores and overall feedback."""
        full_conversation = self.memory.get_full_conversation()
        return await self.assistant.analyze_conversation(
            full_conversation,
            self.assistant.all_feedback,
            self.assistant.native_lang,
            self.assistant.learning_lang,
        )
    
    def set_user_id(self, user_id: str | None) -> None:
        """Set user ID for memory operations."""
        self.memory.user_id = user_id
    
    async def load_user_context(self, user_id: str) -> None:
        """Load user context from memory at session start."""
        await self.memory.load_user_context(user_id)
    
    async def initialize_for_user(
        self,
        user_id: str,
        email: str | None = None,
        name: str | None = None,
        avatar_url: str | None = None,
        learning_lang: str = "en",
        native_lang: str = "en",
        mode: str = "live_call",
        partner: dict[str, Any] | None = None,
    ) -> None:
        """Initialize session for a user.
        
        Handles all setup required when a user connects:
        - Set user ID for memory operations
        - Ensure user exists in memory system (with name/email)
        - Warm memory cache for faster retrieval
        - Ensure session thread exists
        - Load user context (facts, preferences)
        - Set session configuration (languages, mode, partner)
        - Trigger initial AI greeting (roleplay mode only)
        """
        # Set user ID
        self.set_user_id(user_id)
        self.user_profile = {
            "id": user_id,
            "email": email,
            "name": name,
            "avatar_url": avatar_url,
        }
        
        # Parse name for better memory graph construction
        first_name = None
        last_name = None
        if name:
            name_parts = name.split()
            first_name = name_parts[0]
            last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else None
        
        # Ensure user exists in memory system
        await self.memory.ensure_user(
            user_id=user_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        
        # Warm cache for faster context retrieval (Zep best practice)
        try:
            await self.memory.client.user.warm(user_id=user_id)
            LOGGER.info(f"Warmed memory cache for user {user_id}")
        except Exception as e:
            LOGGER.warning(f"Failed to warm memory cache: {e}")
        
        # Set session configuration
        self.set_session_config(learning_lang, native_lang, mode, partner=partner)
        
        # Ensure session thread exists (use partner-specific thread when available)
        await self.memory.ensure_thread(thread_id=self.memory_thread_id, user_id=user_id)
        
        # Load user context (facts, preferences, history)
        await self.load_user_context(user_id)
        
        # Trigger initial AI greeting in roleplay mode and persist it
        if mode == "roleplay":
            try:
                ai_msg = await self.roleplay.emit_ai_turn(
                    user_text="[START]",
                    user_utterance_id="initial",
                    event_type_transcript=EventType.TRANSCRIPT,
                    event_type_translation=EventType.TRANSLATION,
                    recent_conversation=self.memory.get_recent_conversation(),
                    user_context=self.memory.user_context_block,
                    thread_context="",  # No thread context yet for initial greeting
                )
                if ai_msg:
                    partner_label = (self.partner_profile or {}).get("name") or "partner"
                    metadata = self._build_message_identity(
                        is_user=False,
                        speaker=partner_label,
                        source="ai",
                    )
                    translation_val = ai_msg.get("translation")
                    extra: dict[str, Any] | None = None
                    if translation_val:
                        extra = {"translation": translation_val}
                    ai_memory_msg = self._format_memory_message(
                        text=ai_msg.get("text", ""),
                        language=ai_msg.get("language") or self.assistant.learning_lang,
                        metadata=metadata,
                        utterance_id=ai_msg.get("utterance_id"),
                        extra=extra,
                    )
                    self.memory.upsert_message(ai_memory_msg)
            except Exception as e:
                LOGGER.error(f"Failed to emit initial AI greeting: {e}", exc_info=True)
