"""Conversation session orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterable

from . import prompts
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
        self._active_user_utterance_task: asyncio.Task | None = None
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
        )
        self.conversation_id: str = session_id
        self.memory.set_conversation_id(self.conversation_id)

        self.roleplay = Roleplay(
            session_id=session_id,
            llm=llm,
            emit_callback=self._emit,
            memory=self.memory,
        )
        self.roleplay.partner_id = None
        self.partner_profile: dict[str, Any] | None = None
        self.partner_id: str | None = None
        self._has_real_partner: bool = False
        self.user_profile: dict[str, Any] | None = None
        self._last_conversation_summary_update: float = 0.0
        self._conversation_summary_task: asyncio.Task | None = None

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
                    event_type_transcript=EventType.TRANSCRIPT_FINAL,
                    event_type_partial=EventType.TRANSCRIPT_INTERIM,
                )
            )
        ]

        producer = asyncio.create_task(
            SpeechRecognition.broadcast_audio(
                audio_iter,
                [asr_queue],
                on_chunk=self.speech_recognition.advance_audio_cursor_from_chunk,
            )
        )
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
        self._schedule_conversation_summary_update()

        self.lang = lang or self.lang

        # Trigger LLM processing only when speech is final (utterance complete)
        if speech_final:
            if is_mic:
                self._cancel_user_utterance_processing("new_user_turn")
            task = asyncio.create_task(
                self._process_final_utterance(
                    text=text,
                    utterance_id=utterance_id or "",
                    source_lang=lang,
                    source=source or "unknown",
                    is_user=is_mic,
                    start=start,
                    duration=duration,
                )
            )
            if is_mic:
                self._track_user_utterance_task(task)

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
        user_context = self.memory.user_context_block
        recent_conversation = self.memory.get_conversation_recent_history(self.conversation_id)
        target_lang_code = (self.assistant.learning_lang or self.default_lang).lower()
        utterance_lang_code = (source_lang or target_lang_code).lower()
        last_partner_message: str | None = None
        if not is_user and (source or "").lower() != "ai":
            last_partner_message = text

        # Process with LLM (translation, feedback, suggestions)
        formatted_conversation_lines = self._format_conversation_snippets(recent_conversation)
        formatted_recent_conversation = "\n".join(formatted_conversation_lines)
        formatted_recent = formatted_recent_conversation
        await self.assistant.process_utterance(
            text=text,
            utterance_id=utterance_id,
            source_lang=source_lang,
            source=source,
            is_user=is_user,
            event_type_translation=EventType.TRANSLATION,
            event_type_feedback=EventType.FEEDBACK,
            event_type_suggestion=EventType.SUGGESTION,
            recent_conversation=formatted_recent,
            user_context=user_context,
            last_partner_message=last_partner_message,
        )

        if is_user:
            if self.mode == "roleplay":
                user_message_end_time = None
                if start is not None and duration is not None:
                    user_message_end_time = start + duration

                partner_context_block = await self.memory.build_relationship_context(
                    partner_id=self.partner_id,
                    important_limit=4,
                    recent_limit=4,
                )

                # Generate AI response
                self._cancel_roleplay_response("new_user_turn")
                self._active_roleplay_task = asyncio.create_task(
                    self.roleplay.emit_ai_turn(
                        user_text=text,
                        user_utterance_id=utterance_id,
                        event_type_transcript=EventType.TRANSCRIPT_FINAL,
                        event_type_translation=EventType.TRANSLATION,
                        relationship_context=partner_context_block,
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
                    self._schedule_conversation_summary_update()

                    # Suggest response after AI turn (if enabled)
                    if self.assistant.suggest_mode != "off":
                        augmented_lines = self._format_conversation_snippets(recent_conversation + [ai_msg])
                        ai_utt_id = ai_msg.get("utterance_id") or utterance_id
                        ai_text = ai_msg.get("text")
                        asyncio.create_task(
                            self.assistant.emit_suggestion(
                                utterance_id=ai_utt_id,
                                event_type=EventType.SUGGESTION,
                                recent_conversation=augmented_lines,
                                last_partner_message=ai_text,
                                partner_name=self.roleplay.partner_name if self.mode == "roleplay" else None,
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
                utterance_id = payload.get("utterance_id") if isinstance(payload, dict) else None
                assistant_type = event_type.value
                translation_text: str | None = None
                if event_type == EventType.FEEDBACK and isinstance(payload, dict):
                    suggestion_payload = payload.get("suggestion")
                    if isinstance(suggestion_payload, dict):
                        candidate = (suggestion_payload.get("target_text") or "").strip()
                        translation_text = candidate or None
                metadata = self._build_message_identity(
                    is_user=False,
                    speaker="glass",
                    source="glass",
                    assistant_type=assistant_type,
                )
                extra_payload: dict[str, Any] = {"kind": event_type.value}
                if translation_text:
                    extra_payload["translation"] = translation_text
                glass_msg = self._format_memory_message(
                    text=msg_text,
                    language=self.assistant.native_lang,
                    metadata=metadata,
                    utterance_id=utterance_id,
                    extra=extra_payload,
                )
                # Glass messages are append-only (no updates)
                self.memory.append_glass_message(glass_msg)

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

    def _cancel_user_utterance_processing(self, reason: str) -> None:
        task = self._active_user_utterance_task
        if task and not task.done():
            LOGGER.info("[Session] Cancelling user processing (%s)", reason)
            task.cancel()
        self._active_user_utterance_task = None

    def _track_user_utterance_task(self, task: asyncio.Task) -> None:
        self._active_user_utterance_task = task
        task.add_done_callback(self._on_user_utterance_task_done)

    def _on_user_utterance_task_done(self, task: asyncio.Task) -> None:
        if self._active_user_utterance_task is task:
            self._active_user_utterance_task = None

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

    def _build_message_identity(
        self,
        *,
        is_user: bool,
        speaker: str | None = None,
        source: str | None = None,
        assistant_type: str | None = None,
    ) -> dict[str, Any]:
        metadata = self._language_metadata()
        normalized_source = (source or "").lower()
        normalized_speaker = (speaker or "").lower()
        if normalized_source == "glass" or normalized_speaker == "glass":
            metadata.update({"role": "assistant", "speaker_type": "assistant"})
            if assistant_type:
                metadata["assistant_type"] = assistant_type
            return metadata
        if is_user:
            metadata.update(self._user_identity())
            return metadata
        metadata.update(self._partner_identity())
        return metadata

    def _language_metadata(self) -> dict[str, str]:
        return {
            "target_language": (self.assistant.learning_lang or self.default_lang).lower(),
            "native_language": (self.assistant.native_lang or self.default_lang).lower(),
        }

    def _user_identity(self) -> dict[str, Any]:
        profile = self.user_profile or {}
        user_id = profile.get("id") or self.memory.user_id
        normalized_user_id = None
        if isinstance(user_id, str) and user_id.strip():
            normalized_user_id = f"user:{user_id.strip().lower()}"
        fallback_id = f"user:{self.session_id}".lower()
        metadata: dict[str, Any] = {
            "role": "user",
            "speaker_type": "user",
            "is_partner": False,
        }
        metadata["speaker_id"] = normalized_user_id or fallback_id
        return metadata

    def _partner_identity(self) -> dict[str, Any]:
        partner_profile = self.partner_profile or {}
        partner_id = self.partner_id or partner_profile.get("id") or f"partner:{self.session_id}"
        partner_name = partner_profile.get("name")
        metadata: dict[str, Any] = {"role": "partner", "speaker_type": "partner", "is_partner": True}

        def _normalize(value: Any) -> Any:
            return value.lower() if isinstance(value, str) else value

        if partner_id:
            metadata["partner_id"] = _normalize(partner_id)
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
        metadata = dict(metadata)
        metadata.setdefault("message_language", entry["language"])
        for key in (
            "partner_id",
            "partner_name",
            "is_partner",
            "speaker_type",
            "assistant_type",
            "target_language",
            "native_language",
            "message_language",
        ):
            if metadata.get(key):
                entry[key] = metadata[key]
        if utterance_id:
            entry["utterance_id"] = utterance_id
        if extra:
            entry.update(extra)
        return entry

    def _derive_partner_profile(
        self,
        partner: dict[str, Any] | None,
        learning_lang: str,
        native_lang: str,
        mode: str,
    ) -> dict[str, Any]:
        if partner:
            return dict(partner)

        prefix = "live" if mode == "live_call" else "roleplay"
        placeholder_id = f"{prefix}:{self.session_id}"
        return {
            "id": placeholder_id,
            "name": "Partner",
            "description": None,
            "avatar_url": None,
            "voice_id": None,
            "learning_lang": learning_lang,
            "native_lang": native_lang,
            "is_system": False,
        }

    def _apply_roleplay_partner(self, profile: dict[str, Any]) -> None:
        self.roleplay.partner_id = profile.get("id")
        self.roleplay.partner_name = profile.get("name")
        self.roleplay.partner_description = profile.get("description")
        self.roleplay.partner_voice_id = profile.get("voice_id")

    def _schedule_conversation_summary_update(self) -> None:
        if self._conversation_summary_task and not self._conversation_summary_task.done():
            return
        self._conversation_summary_task = asyncio.create_task(self._run_conversation_summary_update())

    async def _run_conversation_summary_update(self) -> None:
        try:
            now = time.time()
            if now - self._last_conversation_summary_update < 15:
                return
            history = self.memory.get_conversation_recent_history(self.conversation_id)
            if not history:
                return
            lines = self._format_conversation_snippets(history[-10:])
            if not lines:
                return
            existing_summary = self.memory.get_conversation_context_summary()
            system_prompt, user_prompt = prompts.build_conversation_summary_prompt(lines, existing_summary)
            async with self._llm_gate:
                summary = await self.assistant.llm.call(
                    prompt=user_prompt,
                    system=system_prompt,
                    temperature=0.1,
                )
            if summary and summary.strip():
                self.memory.update_conversation_context_summary(summary.strip())
                self._last_conversation_summary_update = now
        except Exception:
            pass
        finally:
            self._conversation_summary_task = None

    def _format_conversation_snippets(self, history: list[dict]) -> list[str]:
        snippets: list[str] = []
        for message in history:
            role = (message.get("role") or "partner").lower()
            # Skip Glass AI assistant messages (feedback/suggestions)
            if role == "assistant":
                continue
            if role == "user":
                speaker = "User"
                name = (self.user_profile or {}).get("name")
            elif role == "partner":
                speaker = "Partner"
                name = self.partner_profile.get("name") if self.partner_profile else None
            else:
                # Skip unknown roles
                continue
            speaker_label = f"{speaker} ({name})" if name else speaker
            text = (message.get("text") or "").strip()
            if text:
                snippets.append(f"{speaker_label}: {text}")
        return snippets

    def set_user_profile(self, language_level: str | None, pronunciation_mode: str | None = None) -> None:
        """Set user profile (language level and pronunciation mode)."""
        self.assistant.language_level = language_level
        if pronunciation_mode is not None:
            self.assistant.pronunciation_mode = pronunciation_mode
        if isinstance(self.user_profile, dict):
            self.roleplay.set_user_name(self.user_profile.get("name"))
        LOGGER.info(
            f"Session {self.session_id} profile updated: language_level={language_level}, pronunciation_mode={pronunciation_mode}"
        )

    async def set_session_config(
        self,
        learning_lang: str,
        native_lang: str,
        mode: str,
        partner: dict[str, Any] | None = None,
    ) -> None:
        """Set session configuration including languages, mode, and partner info."""
        self.assistant.learning_lang = learning_lang
        self.assistant.native_lang = native_lang
        self.roleplay.learning_lang = learning_lang
        self.roleplay.native_lang = native_lang
        self.mode = mode
        self.assistant.mode = mode
        self._has_real_partner = bool(partner and partner.get("id"))
        self.partner_profile = self._derive_partner_profile(partner, learning_lang, native_lang, mode)
        self.partner_id = self.partner_profile.get("id")
        self._apply_roleplay_partner(self.partner_profile)

        partner_label = self.roleplay.partner_name
        partner_desc = self.roleplay.partner_description
        LOGGER.info(
            f"Session {self.session_id} config - learning: {learning_lang}, native: {native_lang}, "
            f"mode: {mode}, partner: {partner_label} ({partner_desc})"
        )

    # --- LLM-Related Methods (Delegated to LLMProcessor) -----------------
    async def generate_suggestion(self, user_hint: str | None = None) -> dict:
        """Generate a suggestion based on conversation context.

        Args:
            user_hint: Optional hint from user (e.g., keywords, partial sentence)

        Returns:
            dict with target_text, native_translation, pronunciation
        """

        recent_conversation = self.memory.get_conversation_recent_history(self.conversation_id)
        formatted_recent = self._format_conversation_snippets(recent_conversation)
        last_partner_message = None
        for msg in reversed(recent_conversation):
            role = (msg.get("role") or "").lower()
            if role == "partner":
                last_partner_message = msg.get("text")
                break

        # Generate suggestion via LLM processor (without emitting)
        target_lang_name = lang_code_to_name(self.assistant.learning_lang)
        native_lang_name = lang_code_to_name(self.assistant.native_lang)

        recent_conv_texts = formatted_recent
        system_prompt, user_prompt = prompts.build_suggestion_prompt(
            target_lang=target_lang_name,
            native_lang=native_lang_name,
            user_hint=user_hint,
            recent_conversation=recent_conv_texts,
            last_partner_message=last_partner_message,
            length_mode=self.assistant.suggest_length_mode,
            partner_name=self.roleplay.partner_name if self.mode == "roleplay" else None,
        )

        from ..schemas import SuggestionResponse

        response = await self.assistant.llm.call(
            prompt=user_prompt,
            system=system_prompt,
            temperature=0.7,
            response_schema=SuggestionResponse,
            schema_context={"TARGET": target_lang_name, "NATIVE": native_lang_name},
        )

        result = response if isinstance(response, dict) else None

        if result:
            # Ensure pronunciation if needed
            suggestion = await self.assistant._ensure_pronunciation(result)
            LOGGER.info(f"[Manual Suggestion] Generated: {suggestion.get('target_text', '')[:50]}...")
            return suggestion

        LOGGER.warning("[Manual Suggestion] No valid result from LLM")
        return {"target_text": ""}

    async def analyze_conversation(self) -> dict:
        """Analyze the full conversation and return scores and overall feedback."""
        full_conversation = self.memory.get_full_conversation()
        conversation_summary = self.memory.get_conversation_context_summary()
        return await self.assistant.analyze_conversation(
            full_conversation,
            self.assistant.all_feedback,
            self.assistant.native_lang,
            self.assistant.learning_lang,
            conversation_summary,
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
        - Ensure session conversation binding exists
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
        self.roleplay.set_user_name(name)

        # Parse name for better memory graph construction
        first_name = None
        last_name = None
        if name:
            name_parts = name.split()
            first_name = name_parts[0]
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else None

        # Ensure user exists in memory system
        await self.memory.ensure_user(
            user_id=user_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

        # Set session configuration
        await self.set_session_config(learning_lang, native_lang, mode, partner=partner)

        # Load user context
        await self.load_user_context(user_id)

        # Trigger initial AI greeting in roleplay mode and persist it
        if mode == "roleplay":
            try:
                # Load relationship context (conversation summary not needed yet - no messages)
                relationship_context_block = await self.memory.build_relationship_context(
                    partner_id=self.partner_id,
                    important_limit=4,
                    recent_limit=4,
                )

                # First greeting
                ai_msg = await self.roleplay.emit_ai_turn(
                    user_text="[START]",
                    user_utterance_id="initial",
                    event_type_transcript=EventType.TRANSCRIPT_FINAL,
                    event_type_translation=EventType.TRANSLATION,
                    relationship_context=relationship_context_block,
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
        self._last_conversation_summary_update: float = 0.0
        self._conversation_summary_task: asyncio.Task | None = None
