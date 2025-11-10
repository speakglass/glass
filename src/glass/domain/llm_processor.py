"""LLM processing for translations, feedback, and suggestions."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING
from ..config import get_settings

if TYPE_CHECKING:
    from collections.abc import Sequence
    from .ports import LLMPort

LOGGER = logging.getLogger(__name__)


class LLMProcessor:
    """Handle LLM-related operations like translation, feedback, suggestions."""

    def __init__(
        self,
        session_id: str,
        llm: LLMPort,
        emit_callback,
        llm_gate: asyncio.Semaphore,
    ):
        self.session_id = session_id
        self.llm = llm
        self._emit = emit_callback
        self._llm_gate = llm_gate
        
        # Configuration
        self.feedback_mode: str = "auto"
        self.suggest_mode: str = "auto"
        self.mode: str = "real"
        self.scenario: str | None = None
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"
        self.proficiency: str | None = None
        self.pronunciation_mode: str | None = None
        
        # State
        self._translations: dict[str, str] = {}
        self._suggested_for: set[str] = set()
        self.all_feedback: list[dict] = []

    async def do_translation(
        self, 
        text: str, 
        utterance_id: str, 
        source_lang: str, 
        source: str, 
        is_user: bool,
        event_type_translation,
    ) -> None:
        """Translate text and emit translation event."""
        try:
            # Determine target language
            if self.mode == 'practice':
                target_lang = self._lang_code_to_name(self.native_lang)
            else:
                target_lang = self._lang_code_to_name(self.learning_lang if is_user else self.native_lang)
            
            LOGGER.info(f"[Translation] Starting for utterance {utterance_id}")
            
            if hasattr(self.llm, 'translate'):
                translation = await self.llm.translate(text, source_lang, target_lang)
            else:
                translation = f"[Translation: {text}]"
            
            if translation:
                self._translations[utterance_id] = translation
                await self._emit(
                    event_type_translation,
                    {
                        "utterance_id": utterance_id,
                        "text": translation,
                        "source_lang": source_lang,
                        "target_lang": target_lang.lower(),
                    },
                    source=source,
                )
                LOGGER.info(f"[Translation] Completed for {utterance_id}")
        except Exception as e:
            LOGGER.error(f"[Translation] Failed for {utterance_id}: {e}", exc_info=True)

    async def translate_and_emit(
        self, 
        text: str, 
        utterance_id: str, 
        source_lang: str, 
        source: str, 
        is_user: bool,
        event_type_translation,
        event_type_feedback,
        event_type_answer,
        event_type_follow_up,
        event_type_transcript,
        tail: list[dict],
        start: float | None = None,
        duration: float | None = None,
    ) -> None:
        """Process translation, feedback, AI response, suggestions in parallel."""
        tasks = []
        
        # 1. Translation (always)
        tasks.append(asyncio.create_task(
            self.do_translation(text, utterance_id, source_lang, source, is_user, event_type_translation)
        ))
        
        # 2. Feedback (user only, if enabled)
        if is_user and self.feedback_mode != 'off':
            tasks.append(asyncio.create_task(
                self.do_feedback(text, utterance_id, source, event_type_feedback, tail=list(tail))
            ))
        
        # 3. AI Response (practice mode, user only) - run BEFORE unified suggestion
        ai_msg: dict | None = None
        if self.mode == 'practice' and is_user:
            # Calculate end time of user message
            user_message_end_time = None
            if start is not None and duration is not None:
                user_message_end_time = start + duration
            # Run AI response now so follow-up can include it in context
            ai_msg = await self.do_ai_response(
                text,
                utterance_id,
                tail,
                event_type_transcript,
                event_type_translation,
                event_type_answer,
                user_message_end_time,
            )
        
        # 4. Unified Suggestion trigger (single suggestion only)
        if self.suggest_mode != 'off':
            # Partner/remote message in real mode → suggest once based on decision
            if not is_user and source != 'ai':
                tasks.append(asyncio.create_task(
                    self.do_unified_suggestion(
                        text,
                        utterance_id,
                        list(tail),
                        event_type_answer,
                        event_type_follow_up,
                    )
                ))
            # After AI response in practice mode → suggest once using latest AI msg in context
            elif is_user and ai_msg and isinstance(ai_msg, dict):
                augmented_tail = list(tail)
                augmented_tail.append(ai_msg)
                ai_utt_id = ai_msg.get("utterance_id") or utterance_id
                tasks.append(asyncio.create_task(
                    self.do_unified_suggestion(
                        ai_msg.get("text", ""),
                        ai_utt_id,
                        augmented_tail,
                        event_type_answer,
                        event_type_follow_up,
                    )
                ))
        
        # 5. (Removed) Separate follow-up/answer auto triggers — unified suggestion handles it
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def do_feedback(self, text: str, utterance_id: str, source: str, event_type_feedback, tail: list[dict] | None = None) -> None:
        """Generate and emit feedback for user utterance."""
        try:
            LOGGER.info(f"[Feedback] Starting for utterance {utterance_id}")
            
            if not hasattr(self.llm, 'feedback'):
                return
            
            # Decide whether to request pronunciation from the model (cant_read only)
            want_pron = self.proficiency == 'cant_read'
            feedback_text = await self.llm.feedback(
                text,
                self.learning_lang,
                target_lang=self._lang_code_to_name(self.learning_lang),
                native_lang=self._lang_code_to_name(self.native_lang),
                mode=self.mode,
                include_pronunciation=bool(want_pron),
                pronunciation_mode=self.pronunciation_mode if want_pron else None,
                transcript_tail=(list(tail)[-4:] if tail else None),
            )
            
            # Normalize NONE/empty for Always mode: always surface something user-visible
            normalized = (feedback_text or "").strip()
            if self.feedback_mode == 'always':
                if not normalized or normalized.upper() == "NONE":
                    # Provide a short encouraging affirmation in the user's native language
                    feedback_text = self._default_affirmation(self.native_lang)
                    normalized = feedback_text.strip()
            
            # Parse structured JSON if present, then format to one-line text for legacy UI
            display_text = None
            structured_payload: dict | None = None
            try:
                import json as _json
                parsed = _json.loads(normalized)
                if isinstance(parsed, dict):
                    reason = str(parsed.get('reason_native') or '').strip()
                    suggestion = str(parsed.get('suggestion_target') or '').strip()
                    pron = str(parsed.get('pronunciation') or '').strip()
                    # Gate pronunciation by proficiency
                    if self.proficiency != 'cant_read':
                        pron = ''
                    # Build user-visible line
                    if suggestion:
                        display_text = f"{reason} → {suggestion}" if reason else suggestion
                        if pron:
                            display_text = f"{display_text} | {pron}"
                        # Build structured suggestion object for frontend
                        structured_payload = {"target_text": suggestion}
                        if pron:
                            structured_payload["pronunciation"] = pron
                        if reason:
                            structured_payload["reason_native"] = reason
                    else:
                        display_text = reason or ''
            except Exception:
                # Not JSON; keep as-is
                pass

            if display_text:
                feedback_text = display_text

            # Emit based on mode
            should_emit = False
            if self.feedback_mode == 'always':
                should_emit = bool(normalized)
            elif self.feedback_mode == 'auto':
                should_emit = bool(normalized and normalized.upper() != "NONE")
            
            if should_emit:
                feedback_data = {
                    "utterance_id": utterance_id,
                    "text": feedback_text,
                }
                if structured_payload:
                    feedback_data["suggestion"] = structured_payload
                    feedback_data["auto"] = True
                self.all_feedback.append(feedback_data)
                await self._emit(event_type_feedback, feedback_data, source=source)
                LOGGER.info(f"[Feedback] Completed for {utterance_id}")
            else:
                LOGGER.info(f"[Feedback] Skipped for {utterance_id}")
        except Exception as e:
            LOGGER.error(f"[Feedback] Failed for {utterance_id}: {e}", exc_info=True)

    async def do_ai_response(
        self, 
        text: str, 
        utterance_id: str, 
        tail: list[dict],
        event_type_transcript,
        event_type_translation,
        event_type_answer,
        user_message_end_time: float | None = None,
    ) -> None:
        """Generate AI response in practice mode."""
        try:
            LOGGER.info(f"[AI Response] Starting for utterance {utterance_id}")
            
            if not hasattr(self.llm, 'generate_ai_response'):
                return
            
            target_lang = self._lang_code_to_name(self.learning_lang)
            ai_response = await self.llm.generate_ai_response(text, self.scenario, list(tail), target_lang)
            
            if not ai_response or not ai_response.strip():
                return
            
            ai_utterance_id = str(uuid.uuid4())
            
            # Calculate AI response timing
            # If user_message_end_time is provided, AI responds shortly after
            # Otherwise, default to start=0 (first message)
            ai_start_time = user_message_end_time + 0.5 if user_message_end_time is not None else 0.0
            ai_duration = len(ai_response) * 0.05  # Rough estimate: ~0.05s per character
            
            # Emit AI transcript with TTS flag and timing
            await self._emit(
                event_type_transcript,
                {
                    "utterance_id": ai_utterance_id,
                    "text": ai_response,
                    "is_final": True,
                    "speech_final": True,
                    "lang": target_lang.lower()[:2],
                    "auto_tts": True,
                    "start": ai_start_time,
                    "duration": ai_duration,
                },
                source="ai",
                speaker="ai",
            )
            
            # Translate AI response
            native_lang_name = self._lang_code_to_name(self.native_lang)
            if hasattr(self.llm, 'translate'):
                ai_translation = await self.llm.translate(ai_response, target_lang, native_lang_name)
                if ai_translation:
                    self._translations[ai_utterance_id] = ai_translation
                    await self._emit(
                        event_type_translation,
                        {
                            "utterance_id": ai_utterance_id,
                            "text": ai_translation,
                            "source_lang": target_lang.lower()[:2],
                            "target_lang": native_lang_name.lower(),
                        },
                        source="ai",
                    )
            
            LOGGER.info(f"[AI Response] Completed for {utterance_id}")
            
            # Return message for tail/conversation storage
            return {"speaker": "ai", "source": "ai", "text": ai_response, "utterance_id": ai_utterance_id}
        except Exception as e:
            LOGGER.error(f"[AI Response] Failed for {utterance_id}: {e}", exc_info=True)
            return None

    async def do_answer_suggestion(
        self, 
        text: str, 
        utterance_id: str | None, 
        tail: list[dict],
        event_type_answer,
    ) -> None:
        """Generate answer suggestion for partner messages."""
        try:
            LOGGER.info(f"[Answer Suggestion] Starting for utterance {utterance_id or 'unknown'}")
            
            # Decide whether to suggest
            should = self.suggest_mode == 'always'
            if not should and self.suggest_mode == 'auto':
                try:
                    if hasattr(self.llm, 'should_suggest'):
                        async with self._llm_gate:
                            should = bool(await self.llm.should_suggest(list(tail), 'answer', mode=self.mode))
                    else:
                        should = '?' in (text or '')
                except Exception:
                    should = '?' in (text or '')
            
            if not should:
                return
            
            target_lang_name = self._lang_code_to_name(self.learning_lang)
            native_lang_name = self._lang_code_to_name(self.native_lang)
            require_pronunciation = self.proficiency == 'cant_read'
            pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
            
            suggestion_obj: dict | None = None
            if hasattr(self.llm, 'answer_structured'):
                try:
                    suggestion_obj = await self.llm.answer_structured(
                        list(tail),
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        pronunciation_mode=pronunciation_mode,
                    )
                except Exception as e:
                    LOGGER.error(f"Answer suggestion failed: {e}")
            
            if suggestion_obj is None and hasattr(self.llm, 'answer'):
                plain = await self.llm.answer(list(tail), self.learning_lang, mode=self.mode, target_lang=target_lang_name)
                if plain:
                    suggestion_obj = {"target_text": plain, "native_explanation": ""}
            
            if suggestion_obj and isinstance(suggestion_obj, dict):
                suggestion_obj = self._normalize_suggestion(suggestion_obj)
                await self._emit(
                    event_type_answer,
                    {"text": suggestion_obj.get("target_text", ""), "suggestion": suggestion_obj, "auto": True},
                )
                LOGGER.info(f"[Answer Suggestion] Completed")
        except Exception as e:
            LOGGER.error(f"[Answer Suggestion] Failed: {e}", exc_info=True)

    async def do_unified_suggestion(
        self,
        text: str,
        anchor_utterance_id: str | None,
        tail: list[dict],
        event_type_answer,
        event_type_follow_up,
    ) -> None:
        """Generate exactly one suggestion (answer or follow-up) in a single LLM call."""
        try:
            LOGGER.info(f"[Unified Suggestion] Starting for anchor {anchor_utterance_id or 'unknown'}")

            target_lang_name = self._lang_code_to_name(self.learning_lang)
            native_lang_name = self._lang_code_to_name(self.native_lang)
            require_pronunciation = self.proficiency == 'cant_read'
            pronunciation_mode = self.pronunciation_mode if require_pronunciation else None

            # Use unified suggestion (one LLM call with type + content)
            result: dict | None = None
            if hasattr(self.llm, 'suggest_unified'):
                try:
                    async with self._llm_gate:
                        result = await self.llm.suggest_unified(
                            list(tail),
                            target_lang=target_lang_name,
                            native_lang=native_lang_name,
                            pronunciation_mode=pronunciation_mode,
                            mode=self.mode,
                            suggest_mode=self.suggest_mode,
                        )
                except Exception as e:
                    LOGGER.error(f"Unified suggestion failed: {e}", exc_info=True)
                    return

            if not result:
                LOGGER.info("[Unified Suggestion] No result from LLM")
                return

            kind = result.get("type", "none")
            
            if kind == "none":
                LOGGER.info("[Unified Suggestion] Skipped (kind=none)")
                return

            if kind not in {"answer", "follow_up"}:
                LOGGER.warning(f"[Unified Suggestion] Invalid kind: {kind}")
                return

            # Deduplicate per anchor/kind
            if not self._dedupe_once(self._dedupe_key(anchor_utterance_id, kind)):
                LOGGER.info(f"[Unified Suggestion] Skipped duplicate for {anchor_utterance_id}:{kind}")
                return

            # Normalize and emit
            suggestion_obj = self._normalize_suggestion(result)
            if suggestion_obj:
                await self._emit_suggestion(kind, suggestion_obj, event_type_answer, event_type_follow_up)
        except Exception as e:
            LOGGER.error(f"[Unified Suggestion] Failed: {e}", exc_info=True)

    async def do_followup_suggestion(
        self, 
        text: str, 
        utterance_id: str | None, 
        tail: list[dict],
        event_type_follow_up,
    ) -> None:
        """Generate follow-up suggestion after user's turn."""
        try:
            LOGGER.info(f"[Follow-up Suggestion] Starting for utterance {utterance_id or 'unknown'}")
            
            # Skip if user asked a question
            if text and ('?' in text or text.rstrip().endswith('?')):
                LOGGER.info(f"[Follow-up Suggestion] Skipped - user asked a question")
                return
            
            # Decide whether to suggest
            should = self.suggest_mode == 'always'
            if not should and self.suggest_mode == 'auto':
                try:
                    if hasattr(self.llm, 'should_suggest'):
                        async with self._llm_gate:
                            should = bool(await self.llm.should_suggest(list(tail), 'follow_up', mode=self.mode))
                    else:
                        should = len((text or '').split()) >= 3 and '?' not in text
                except Exception:
                    should = len((text or '').split()) >= 3 and '?' not in text
            
            if not should:
                return
            
            target_lang_name = self._lang_code_to_name(self.learning_lang)
            native_lang_name = self._lang_code_to_name(self.native_lang)
            require_pronunciation = self.proficiency == 'cant_read'
            pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
            
            suggestion_obj: dict | None = None
            if hasattr(self.llm, 'follow_up_structured'):
                try:
                    suggestion_obj = await self.llm.follow_up_structured(
                        list(tail),
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        pronunciation_mode=pronunciation_mode,
                    )
                except Exception:
                    pass
            
            if suggestion_obj is None and hasattr(self.llm, 'follow_up'):
                plain = await self.llm.follow_up(list(tail), self.learning_lang)
                if plain:
                    suggestion_obj = {"target_text": plain, "native_explanation": ""}
            
            if suggestion_obj and isinstance(suggestion_obj, dict):
                suggestion_obj = self._normalize_suggestion(suggestion_obj)
                await self._emit(
                    event_type_follow_up,
                    {"text": suggestion_obj.get("target_text", ""), "suggestion": suggestion_obj, "auto": True},
                )
                LOGGER.info(f"[Follow-up Suggestion] Completed")
        except Exception as e:
            LOGGER.error(f"[Follow-up Suggestion] Failed: {e}", exc_info=True)

    async def generate_answer(self, tail: list[dict], lang: str) -> dict:
        """Generate answer suggestion on demand."""
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        
        if hasattr(self.llm, 'answer_structured'):
            result = await self.llm.answer_structured(
                list(tail),
                target_lang=target_lang_name,
                native_lang=native_lang_name,
                pronunciation_mode=pronunciation_mode,
            )
            return self._normalize_suggestion(result)
        if hasattr(self.llm, 'answer'):
            if self.mode == 'practice':
                plain = await self.llm.answer(list(tail), lang, mode=self.mode, target_lang=target_lang_name)
            else:
                plain = await self.llm.answer(list(tail), lang, mode=self.mode)
            return {"target_text": plain, "native_explanation": ""}
        return {"target_text": "Answer generation not supported", "native_explanation": ""}

    async def generate_follow_up(self, tail: list[dict], lang: str) -> dict:
        """Generate follow-up suggestion on demand."""
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        
        if hasattr(self.llm, 'follow_up_structured'):
            result = await self.llm.follow_up_structured(
                list(tail),
                target_lang=target_lang_name,
                native_lang=native_lang_name,
                pronunciation_mode=pronunciation_mode,
            )
            return self._normalize_suggestion(result)
        if hasattr(self.llm, 'follow_up'):
            plain = await self.llm.follow_up(list(tail), lang)
            return {"target_text": plain, "native_explanation": ""}
        return {"target_text": "Follow-up generation not supported", "native_explanation": ""}

    async def generate_suggestion(self, tail: list[dict], lang: str) -> tuple[str, dict]:
        """Generate a unified suggestion (answer or follow-up) in one LLM call.
        
        Returns:
            A tuple of (suggestion_type, suggestion_dict) where suggestion_type is 'answer' or 'follow_up'
        """
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        
        # Use unified suggestion if available (one LLM call with type + content)
        if hasattr(self.llm, 'suggest_unified'):
            try:
                result = await self.llm.suggest_unified(
                    list(tail),
                    target_lang=target_lang_name,
                    native_lang=native_lang_name,
                    pronunciation_mode=pronunciation_mode,
                    mode=self.mode,
                    suggest_mode=self.suggest_mode,
                )
                
                suggestion_type = result.get("type", "follow_up")
                
                # If type is "none", return empty follow_up
                if suggestion_type == "none":
                    return ("follow_up", {"target_text": "", "native_translation": ""})
                
                # Normalize and return
                suggestion = self._normalize_suggestion(result)
                return (suggestion_type, suggestion)
            except Exception as e:
                LOGGER.error(f"Unified suggestion failed: {e}", exc_info=True)
        
        # Fallback: use separate methods
        last_text = ""
        if tail:
            last = tail[-1] if isinstance(tail[-1], dict) else {}
            last_text = (last.get("text") if isinstance(last, dict) else "") or ""
        
        kind = "answer" if ("?" in last_text) else "follow_up"
        
        if kind == "answer":
            suggestion = await self.generate_answer(tail, lang)
            return ("answer", suggestion)
        else:
            suggestion = await self.generate_follow_up(tail, lang)
            return ("follow_up", suggestion)

    async def translate_input(self, text: str, tail: list[dict]) -> dict:
        """Translate user input (keywords or sentence) to target language with pronunciation.
        
        Args:
            text: User input (keywords like "coffee tomorrow" or full sentence)
            tail: Conversation context for better translation
        
        Returns:
            dict with target_text, native_translation, pronunciation
        """
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        
        if hasattr(self.llm, 'translate_structured'):
            result = await self.llm.translate_structured(
                text,
                source_lang=native_lang_name,
                target_lang=target_lang_name,
                pronunciation_mode=pronunciation_mode,
                context=list(tail) if tail else None,
            )
            return self._normalize_suggestion(result)
        
        # Fallback to simple translation
        if hasattr(self.llm, 'translate'):
            simple = await self.llm.translate(text, native_lang_name, target_lang_name)
            return {"target_text": simple, "native_translation": ""}
        
        return {"target_text": text, "native_translation": ""}

    async def generate_initial_greeting(
        self, 
        tail: list[dict],
        full_conversation: list[dict],
        event_type_transcript,
        event_type_translation,
        event_type_answer,
    ) -> dict | None:
        """Generate initial AI greeting in practice mode."""
        try:
            LOGGER.info(f"Generating initial greeting for practice mode")
            if not hasattr(self.llm, 'generate_ai_response'):
                return None
            
            target_lang = self._lang_code_to_name(self.learning_lang)
            initial_prompt = self._get_initial_prompt()
            
            ai_greeting = await self.llm.generate_ai_response(initial_prompt, self.scenario, [], target_lang)
            
            if not ai_greeting or not ai_greeting.strip():
                return None
            
            ai_utterance_id = str(uuid.uuid4())
            
            # Calculate timing for initial greeting (first message)
            ai_start_time = 0.0
            ai_duration = len(ai_greeting) * 0.05  # Rough estimate: ~0.05s per character
            
            # Emit AI transcript
            await self._emit(
                event_type_transcript,
                {
                    "utterance_id": ai_utterance_id,
                    "text": ai_greeting,
                    "is_final": True,
                    "speech_final": True,
                    "lang": target_lang.lower()[:2],
                    "auto_tts": True,
                    "start": ai_start_time,
                    "duration": ai_duration,
                },
                source="ai",
                speaker="ai",
            )
            
            # Translate greeting
            native_lang_name = self._lang_code_to_name(self.native_lang)
            if hasattr(self.llm, 'translate'):
                greeting_translation = await self.llm.translate(ai_greeting, target_lang, native_lang_name)
                if greeting_translation:
                    self._translations[ai_utterance_id] = greeting_translation
                    await self._emit(
                        event_type_translation,
                        {
                            "utterance_id": ai_utterance_id,
                            "text": greeting_translation,
                            "source_lang": target_lang.lower()[:2],
                            "target_lang": native_lang_name.lower(),
                        },
                        source="ai",
                    )
            
            LOGGER.info(f"Emitted initial AI greeting: {ai_greeting}")
            
            # Generate answer suggestion after initial greeting
            try:
                if self.suggest_mode != 'off':
                    should_ans = self.suggest_mode == 'always'
                    if not should_ans and self.suggest_mode == 'auto':
                        try:
                            if hasattr(self.llm, 'should_suggest'):
                                async with self._llm_gate:
                                    should_ans = bool(await self.llm.should_suggest([{"speaker": "ai", "source": "ai", "text": ai_greeting}], 'answer', mode=self.mode))
                            else:
                                should_ans = '?' in (ai_greeting or '')
                        except Exception:
                            should_ans = '?' in (ai_greeting or '')
                    
                    if should_ans:
                        target_lang_name = self._lang_code_to_name(self.learning_lang)
                        native_lang_name = self._lang_code_to_name(self.native_lang)
                        require_pronunciation = self.proficiency == 'cant_read'
                        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
                        
                        suggestion_obj: dict | None = None
                        if hasattr(self.llm, 'answer_structured'):
                            try:
                                suggestion_obj = await self.llm.answer_structured(
                                    [{"speaker": "ai", "source": "ai", "text": ai_greeting}],
                                    target_lang=target_lang_name,
                                    native_lang=native_lang_name,
                                    pronunciation_mode=pronunciation_mode,
                                )
                            except Exception as e:
                                LOGGER.error(f"Answer suggestion (initial) failed: {e}")
                                suggestion_obj = None
                        
                        if suggestion_obj is None and hasattr(self.llm, 'answer'):
                            plain = await self.llm.answer([{"speaker": "ai", "source": "ai", "text": ai_greeting}], target_lang.lower()[:2], mode=self.mode, target_lang=target_lang_name)
                            if plain:
                                suggestion_obj = {"target_text": plain, "native_explanation": ""}
                        
                        if suggestion_obj and isinstance(suggestion_obj, dict):
                            suggestion_obj = self._normalize_suggestion(suggestion_obj)
                            await self._emit(
                                event_type_answer,
                                {"text": suggestion_obj.get("target_text", ""), "suggestion": suggestion_obj, "auto": True},
                            )
                            LOGGER.info(f"Emitted initial answer suggestion")
            except Exception as e:
                LOGGER.error(f"Initial answer suggestion failed: {e}")
            
            # Return message for storage
            return {
                "speaker": "ai", 
                "source": "ai", 
                "text": ai_greeting, 
                "utterance_id": ai_utterance_id,
                "start": ai_start_time,
                "duration": ai_duration,
            }
        except Exception as e:
            LOGGER.error(f"Failed to generate initial greeting: {e}", exc_info=True)
            return None

    async def analyze_conversation(
        self, 
        full_conversation: list[dict], 
        all_feedback: list[dict],
        native_lang: str,
        learning_lang: str,
    ) -> dict:
        """Analyze conversation and return scores, insights, feedback."""
        if not full_conversation:
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "extracted_info": [],
                "overall_feedback": "No conversation data to analyze.",
            }
        
        # Build transcript
        transcript_lines = []
        for msg in full_conversation:
            speaker = msg.get("speaker", "unknown")
            text = msg.get("text", "")
            transcript_lines.append(f"{speaker}: {text}")
        transcript = "\n".join(transcript_lines)
        
        # Build feedback summary
        feedback_summary = ""
        if all_feedback:
            feedback_lines = [f"- {fb.get('text', '')}" for fb in all_feedback]
            feedback_summary = "\n".join(feedback_lines)
        
        native_lang_name = self._lang_code_to_name(native_lang)
        learning_lang_name = self._lang_code_to_name(learning_lang)
        
        analysis_prompt = f"""You are analyzing a language learning conversation. The user is learning {learning_lang_name} and their native language is {native_lang_name}.

Conversation transcript:
{transcript}

Feedback given during conversation:
{feedback_summary or 'No feedback was given.'}

IMPORTANT: 
- Provide ALL text (labels, values, and feedback) in {native_lang_name}
- This is SPOKEN conversation transcribed by speech-to-text. DO NOT criticize punctuation, capitalization, or formatting - these are STT artifacts, not user mistakes
- Focus feedback on: vocabulary choice, grammar patterns, natural expression, conversation flow, and communication effectiveness
- Evaluate ONLY the learner's utterances (speaker 'user' / microphone-origin). Use partner lines only for context.
- If there are ZERO learner utterances, return scores all 0, empty extracted_info, and feedback: "사용자 발화가 없어 평가할 수 없어요."
- If there is very little learner data (e.g., 1 utterance), be conservative and avoid generic over-praise.
- Output STRICT JSON ONLY. No backticks, no prose outside JSON. Numbers must be numbers (not strings).
- Keep feedback short and natural (3–5 sentences), warm but specific.

Please provide a comprehensive analysis with:

1. SCORES (0-100 scale):
   - Fluency: How smoothly and naturally the user spoke
   - Accuracy: Grammar, vocabulary, and pronunciation correctness
   - Comprehensibility: How easy it was to understand the user

2. EXTRACTED INFORMATION: Categorize key facts about the user using these entity types (translate the type name to {native_lang_name}):
   - User: User's name, identity, role
   - Preference: User's preferences, choices, opinions, likes/dislikes (PRIORITIZE THIS)
   - Location: Places mentioned (physical or virtual)
   - Event: Time-bound activities, occurrences
   - Object: Physical items, tools, devices
   - Topic: Subjects of interest, knowledge domains
   - Organization: Companies, institutions, groups
   - Document: Information content

Rules for EXTRACTED INFORMATION:
- Include ONLY items that are supported by the user's utterances; do not invent.
- Omit placeholder entries and any item whose value is empty or generic.
- If no items qualify, set "extracted_info": [].

3. FEEDBACK: Write conversational feedback in {native_lang_name} as a teacher would speak to a student.
   - Be warm, encouraging, and natural, but concise.
   - Discuss strengths and one or two concrete improvement tips (no bullet points).
   - Speak directly to the user in a supportive tone.

Format your response as JSON:
{{
  "scores": {{
    "fluency": <number 0-100>,
    "accuracy": <number 0-100>,
    "comprehensibility": <number 0-100>
  }},
  "extracted_info": [
    {{"label": "User", "value": "Name is...", "editable": true}},
    {{"label": "Preference", "value": "Likes/prefers...", "editable": true}},
    {{"label": "Topic", "value": "Interested in...", "editable": true}}
  ],
  "feedback": "I'm really impressed with how you... You did a great job with... One thing to work on would be... Keep practicing and you'll see improvement in..."
}}

Remember: ALL text content (label, value, feedback) must be in {native_lang_name}!"""

        try:
            if hasattr(self.llm, 'generate_text'):
                # Use configurable analysis model from settings (defaults to gpt-5-mini)
                settings = get_settings()
                analysis_model = getattr(settings, "openai_analysis_model", None) or "gpt-5-mini"
                response = await self.llm.generate_text(analysis_prompt, model=analysis_model)
                import json
                import re
                json_match = re.search(r'\{[\s\S]*\}', response)
                if json_match:
                    result = json.loads(json_match.group())
                    # Post-process to drop placeholder/empty extracted info and dedupe
                    try:
                        raw_items = result.get("extracted_info", []) or []
                        seen: set[tuple[str, str]] = set()
                        filtered: list[dict] = []
                        for item in raw_items:
                            if not isinstance(item, dict):
                                continue
                            label = str(item.get("label") or "").strip()
                            value = str(item.get("value") or "").strip()
                            if not label or not value:
                                continue
                            lower_value = value.lower()
                            if lower_value in {"none", "n/a", "na", "unknown"}:
                                continue
                            key = (label, value)
                            if key in seen:
                                continue
                            seen.add(key)
                            filtered.append({
                                "label": label,
                                "value": value,
                                "editable": bool(item.get("editable", True)),
                            })
                        result["extracted_info"] = filtered
                    except Exception:
                        # Non-fatal; keep original result if filtering fails
                        pass
                    return result
            
            # Fallback
            return {
                "scores": {"fluency": 70, "accuracy": 75, "comprehensibility": 80},
                "extracted_info": [
                    {"label": "Event", "value": f"Exchanged {len(full_conversation)} messages", "editable": False}
                ],
                "feedback": "✨ Strengths:\n• Engaged in conversation\n• Attempted to communicate\n\n🎯 Areas for Improvement:\n• Continue practicing\n• Focus on fluency",
            }
        except Exception as e:
            LOGGER.error(f"Failed to analyze conversation: {e}", exc_info=True)
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "extracted_info": [],
                "feedback": f"Analysis failed: {str(e)}",
            }

    def _normalize_suggestion(self, suggestion: dict) -> dict:
        """Clean up suggestion object."""
        try:
            target_text = str(suggestion.get("target_text") or "")
            tokens = suggestion.get("pronunciation_tokens")
            if isinstance(tokens, list) and tokens:
                try:
                    readings = []
                    def _key(t: dict) -> int:
                        try:
                            return int(t.get("start", 0))
                        except Exception:
                            return 0
                    for item in sorted([t for t in tokens if isinstance(t, dict)], key=_key):
                        r = str(item.get("reading") or "").strip()
                        if r:
                            readings.append(r)
                    if readings and "pronunciation" not in suggestion:
                        suggestion["pronunciation"] = " ".join(readings)
                except Exception:
                    pass
                suggestion.pop("pronunciation_tokens", None)
            
            # Drop pronunciation if it duplicates translation or target text
            try:
                pron = str(suggestion.get("pronunciation") or "").strip()
                if pron and (pron == str(suggestion.get("native_translation") or "").strip() or pron == target_text.strip()):
                    suggestion.pop("pronunciation", None)
            except Exception:
                pass
        except Exception:
            pass
        return suggestion

    # --- Small helpers to keep unified suggestion readable -----------------
    @staticmethod
    def _dedupe_key(anchor_utterance_id: str | None, kind: str) -> str:
        return f"{(anchor_utterance_id or 'unknown')}:{kind}"

    def _dedupe_once(self, key: str) -> bool:
        if key in self._suggested_for:
            return False
        self._suggested_for.add(key)
        return True

    def _get_lang_params(self) -> tuple[str, str, str | None]:
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        return target_lang_name, native_lang_name, pronunciation_mode

    async def _generate_suggestion_for_kind(self, kind: str, tail: list[dict]) -> dict | None:
        target_lang_name, native_lang_name, pronunciation_mode = self._get_lang_params()
        suggestion_obj: dict | None = None
        if kind == "answer":
            if hasattr(self.llm, 'answer_structured'):
                try:
                    suggestion_obj = await self.llm.answer_structured(
                        list(tail),
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        pronunciation_mode=pronunciation_mode,
                    )
                except Exception as e:
                    LOGGER.error(f"Unified answer suggestion failed: {e}")
            if suggestion_obj is None and hasattr(self.llm, 'answer'):
                plain = await self.llm.answer(list(tail), self.learning_lang, mode=self.mode, target_lang=target_lang_name)
                if plain:
                    suggestion_obj = {"target_text": plain, "native_explanation": ""}
        elif kind == "follow_up":
            if hasattr(self.llm, 'follow_up_structured'):
                try:
                    suggestion_obj = await self.llm.follow_up_structured(
                        list(tail),
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        pronunciation_mode=pronunciation_mode,
                    )
                except Exception:
                    pass
            if suggestion_obj is None and hasattr(self.llm, 'follow_up'):
                plain = await self.llm.follow_up(list(tail), self.learning_lang)
                if plain:
                    suggestion_obj = {"target_text": plain, "native_explanation": ""}
        return suggestion_obj

    async def _emit_suggestion(self, kind: str, suggestion_obj: dict, event_type_answer, event_type_follow_up) -> None:
        suggestion_obj = self._normalize_suggestion(suggestion_obj)
        payload = {"text": suggestion_obj.get("target_text", ""), "suggestion": suggestion_obj, "auto": True}
        if kind == "answer":
            await self._emit(event_type_answer, payload)
            LOGGER.info("[Unified Suggestion] Emitted: answer")
        else:
            await self._emit(event_type_follow_up, payload)
            LOGGER.info("[Unified Suggestion] Emitted: follow_up")

    def _get_initial_prompt(self) -> str:
        """Get initial prompt for scenario-based greeting."""
        if not self.scenario:
            return "[Start conversation]"
        
        if self.scenario.startswith("custom:"):
            return "[Start conversation in this scenario]"
        
        scenario_prompts = {
            "airport": "[I approach the check-in counter]",
            "restaurant": "[I enter the restaurant]",
            "interview": "[I enter the interview room]",
            "shopping": "[I enter the store]",
            "casual": "[Start casual conversation]",
            "phone": "[Phone rings]",
        }
        return scenario_prompts.get(self.scenario, "[Start conversation]")

    @staticmethod
    def _lang_code_to_name(code: str) -> str:
        """Convert language code to full name."""
        lang_map = {
            'en': 'English',
            'ko': 'Korean',
            'ja': 'Japanese',
            'zh': 'Chinese',
            'es': 'Spanish',
            'fr': 'French',
        }
        return lang_map.get(code, code.capitalize())

    @staticmethod
    def _default_affirmation(lang_code: str) -> str:
        """Return a short, encouraging default feedback in the user's native language.
        Used when feedback_mode is 'always' but the model indicates no feedback (e.g., "NONE").
        """
        messages = {
            'ko': "좋아요! 지금처럼 말해도 자연스러워요.",
            'en': "Great! That sounded natural as is.",
            'ja': "いいですね！今の表現で自然です。",
            'zh': "很好！这样说很自然。",
            'es': "¡Genial! Suena natural tal como está.",
            'fr': "Super ! C’est naturel comme ça.",
        }
        return messages.get(lang_code, "Great! That sounded natural as is.")

