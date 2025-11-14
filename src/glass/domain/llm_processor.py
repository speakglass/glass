"""LLM processing for translations, feedback, and suggestions."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import TYPE_CHECKING, Any
from ..config import get_settings

if TYPE_CHECKING:
    from .ports import LLMPort, MemoryPort

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
        self.suggest_length_mode: str = "auto"  # 'auto', 'short' (1 sentence), 'long' (4 sentences)
        self.mode: str = "real"
        self.scenario: str | None = None
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"
        self.proficiency: str | None = None
        self.pronunciation_mode: str | None = None
        
        # Context window size (Zep best practice: 5 messages)
        self.context_window_size: int = 5
        
        # State
        self._translations: dict[str, str] = {}
        self._suggested_for: set[str] = set()
        self.all_feedback: list[dict] = []
        self._last_suggestion: dict | None = None  # Most recent suggestion (for comparison with next user utterance)
        
        # Memory and user context (set by pipeline)
        self.memory: MemoryPort | None = None  # Will be set by pipeline
        self.user_id: str | None = None  # Will be set by WebSocket route
        self.user_context_block: str = ""  # Pre-fetched user context from Zep (fetched once at session start)
        self.user_context_loaded_at: float = 0  # When user context was loaded
        self.important_events_count: int = 0  # Counter for important events
        
    def set_user_id(self, user_id: str | None):
        """Set user ID for both processor and LLM adapter (for Zep tool calls)."""
        self.user_id = user_id
        # Pass user_id to LLM adapter if it supports it (for tool calling)
        if hasattr(self.llm, 'user_id'):
            self.llm.user_id = user_id
    
    def set_memory_adapter(self, memory_adapter):
        """Set memory adapter for both processor and LLM adapter (for Zep tool calls)."""
        self.memory = memory_adapter
        # Pass memory_adapter to LLM adapter if it supports it (for tool calling)
        if hasattr(self.llm, 'memory_adapter'):
            self.llm.memory_adapter = memory_adapter
    
    def _get_recent_conversation(self, tail: list[dict]) -> list[dict]:
        """Extract recent N messages from tail (Zep best practice: 5 messages)."""
        return tail[-self.context_window_size:] if tail else []
    
    async def load_user_context(self, session_id: str, user_id: str):
        """Load user-level context from Zep once at session start.
        
        This fetches the user's accumulated facts, preferences, and history
        from all their past conversations and stores it for reuse throughout the session.
        
        Note: Uses user-level context (not thread), as thread is empty at session start.
        """
        if not self.memory or not user_id:
            return
        
        try:
            # Get user-level context (accumulated from all past conversations)
            context_block = await self.memory.get_user_context_block(user_id, use_cache=True)
            self.user_context_block = context_block or ""
            self.user_context_loaded_at = time.time()
            
            if self.user_context_block:
                LOGGER.info(f"[UserContext] Loaded {len(self.user_context_block)} chars for user {user_id}")
            else:
                LOGGER.info(f"[UserContext] No prior context for user {user_id} (new user)")
        except Exception as e:
            LOGGER.warning(f"[UserContext] Failed to load context: {e}")
            self.user_context_block = ""
            self.user_context_loaded_at = time.time()
    
    async def maybe_refresh_user_context(self):
        """Refresh user context if needed (5min or 10 important events)."""
        if not self.memory or not self.user_id:
            return
        
        now = time.time()
        elapsed = now - self.user_context_loaded_at
        
        should_refresh = (
            (elapsed > 300)  # 5 minutes
            or (self.important_events_count >= 10)
        )
        
        if should_refresh:
            LOGGER.info(
                f"[Context] Refreshing (elapsed={elapsed:.0f}s, events={self.important_events_count})"
            )
            asyncio.create_task(self._refresh_user_context_background())
    
    async def _refresh_user_context_background(self):
        """Background task to refresh user context without blocking."""
        try:
            new_context = await self.memory.get_user_context_block(
                self.user_id, 
                use_cache=False  # Force refresh
            )
            self.user_context_block = new_context or ""
            self.user_context_loaded_at = time.time()
            self.important_events_count = 0
            
            LOGGER.info(f"[Context] Refreshed successfully ({len(self.user_context_block)} chars)")
        except Exception as e:
            LOGGER.warning(f"[Context] Refresh failed: {e}")
    
    def mark_important_event(self, event_type: str):
        """Mark an important event (repeated mistake, new expression, etc.)."""
        self.important_events_count += 1
        LOGGER.debug(
            f"[Context] Important event: {event_type} (count={self.important_events_count})"
        )
        
        # Trigger refresh check
        if self.important_events_count >= 10:
            asyncio.create_task(self.maybe_refresh_user_context())

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
            
            try:
                translation = await self.llm.translate(text, source_lang, target_lang)
            except Exception:
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

    async def process_utterance(
        self, 
        text: str, 
        utterance_id: str, 
        source_lang: str, 
        source: str, 
        is_user: bool,
        event_type_translation,
        event_type_feedback,
        event_type_suggestion,
        event_type_transcript,
        tail: list[dict],
        start: float | None = None,
        duration: float | None = None,
    ) -> None:
        """Process utterance: translation, feedback, AI response, and suggestions."""
        tasks = []
        
        # 1. Translation (always)
        tasks.append(asyncio.create_task(
            self.do_translation(text, utterance_id, source_lang, source, is_user, event_type_translation)
        ))
        
        # 2. Feedback (user only, if enabled)
        if is_user and self.feedback_mode != 'off':
            tasks.append(asyncio.create_task(
                self.emit_feedback(text, utterance_id, source, event_type_feedback, tail=list(tail))
            ))
        
        # 3. AI Response (practice mode, user only)
        ai_msg: dict | None = None
        if self.mode == 'practice' and is_user:
            user_message_end_time = None
            if start is not None and duration is not None:
                user_message_end_time = start + duration
            ai_msg = await self.emit_ai_response(
                text,
                utterance_id,
                tail,
                event_type_transcript,
                event_type_translation,
                event_type_suggestion,
                user_message_end_time,
            )
        
        # 4. Suggestion (if enabled)
        if self.suggest_mode != 'off':
            # Partner/remote message in real mode → suggest response
            if not is_user and source != 'ai':
                tasks.append(asyncio.create_task(
                    self.emit_suggestion(
                        utterance_id=utterance_id,
                        tail=list(tail),
                        event_type=event_type_suggestion,
                    )
                ))
            # After AI response in practice mode → suggest with AI context
            elif is_user and ai_msg and isinstance(ai_msg, dict):
                augmented_tail = list(tail)
                augmented_tail.append(ai_msg)
                ai_utt_id = ai_msg.get("utterance_id") or utterance_id
                tasks.append(asyncio.create_task(
                    self.emit_suggestion(
                        utterance_id=ai_utt_id,
                        tail=augmented_tail,
                        event_type=event_type_suggestion,
                    )
                ))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def emit_feedback(self, text: str, utterance_id: str, source: str, event_type_feedback, tail: list[dict] | None = None) -> None:
        """Emit feedback for a user utterance with optimized context."""
        try:
            LOGGER.info(f"[Feedback] Starting for utterance {utterance_id}")
            
            # Lightweight gating: skip expensive feedback call if not needed in auto mode
            if self.feedback_mode == 'auto':
                try:
                    async with self._llm_gate:
                        should_fb = bool(await self.llm.should_feedback(
                            self._get_recent_conversation(tail or []), 
                            text, 
                            mode=self.mode
                        ))  # type: ignore[attr-defined]
                except Exception:
                    # Fallback heuristic: only longer utterances likely need feedback
                    should_fb = len((text or '').split()) >= 4
                if not should_fb:
                    LOGGER.info(f"[Feedback] Gated off by should_feedback for {utterance_id}")
                    return
            
            # Get thread context (fast, < 200ms)
            thread_context = ""
            if self.memory and self.user_id:
                thread_context = await self.memory.get_context_for_prompt(
                    thread_id=self.session_id,
                    user_id=self.user_id,
                    scope="thread",
                    timeout=2.0,
                )
            
            # Generate feedback (with last suggestion if available)
            feedback_text = await self.llm.feedback(
                text,
                self.learning_lang,
                target_lang=self._lang_code_to_name(self.learning_lang),
                native_lang=self._lang_code_to_name(self.native_lang),
                mode=self.mode,
                recent_conversation=self._get_recent_conversation(tail or []),
                user_context=self.user_context_block,  # Pre-loaded
                thread_context=thread_context,  # Real-time
                last_suggestion=self._last_suggestion,  # For pronunciation/similarity comparison
            )
            
            # Clear last suggestion after use (one-time comparison)
            if self._last_suggestion:
                LOGGER.debug(f"[Feedback] Used suggestion: {self._last_suggestion.get('target_text', '')[:30]}")
                self._last_suggestion = None
            
            # Normalize NONE/empty for Always mode
            normalized = (feedback_text or "").strip()
            LOGGER.debug(f"[Feedback] Raw response: {normalized[:100]}")
            
            if self.feedback_mode == 'always':
                if not normalized or normalized.upper() == "NONE":
                    feedback_text = self._default_affirmation(self.native_lang)
                    normalized = feedback_text.strip()
                    LOGGER.info(f"[Feedback] Using default affirmation: {feedback_text}")
            
            # Parse structured JSON if present
            display_text = None
            structured_payload: dict | None = None
            try:
                import json as _json
                import re
                
                # Extract JSON from markdown code blocks if present (```json ... ```)
                json_text = normalized
                json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', normalized)
                if json_match:
                    json_text = json_match.group(1).strip()
                    LOGGER.debug("[Feedback] Extracted JSON from code block")
                
                parsed = _json.loads(json_text)
                if isinstance(parsed, dict):
                    reason = str(parsed.get('reason_native') or '').strip()
                    suggestion = str(parsed.get('suggestion_target') or '').strip()
                    
                    LOGGER.debug(f"[Feedback] Parsed JSON - reason: {reason[:50] if reason else 'None'}, suggestion: {suggestion[:50] if suggestion else 'None'}")
                    
                    # Build display text
                    if suggestion:
                        display_text = f"{reason} → {suggestion}" if reason else suggestion
                        structured_payload = {"target_text": suggestion}
                        if reason:
                            structured_payload["reason_native"] = reason
                    else:
                        display_text = reason or ''
            except Exception as e:
                # Not JSON; keep as-is
                LOGGER.debug(f"[Feedback] Not JSON or parse failed: {str(e)}")
                pass

            if display_text:
                feedback_text = display_text

            # Ensure pronunciation for feedback corrections if needed
            if structured_payload and structured_payload.get("target_text"):
                structured_payload = await self._ensure_pronunciation(structured_payload)

            # Emit based on mode
            should_emit = bool(normalized) and (
                self.feedback_mode == 'always' or self.feedback_mode == 'auto'
            )
            
            LOGGER.info(f"[Feedback] Decision - should_emit: {should_emit}, normalized: '{normalized[:50]}...', mode: {self.feedback_mode}")
            
            if should_emit:
                feedback_data: dict[str, Any] = {
                    "utterance_id": utterance_id,
                    "text": feedback_text,
                }
                if structured_payload:
                    feedback_data["suggestion"] = structured_payload
                    feedback_data["auto"] = True
                self.all_feedback.append(feedback_data)
                # Emit as Glass learning assistant for memory tracking
                await self._emit(event_type_feedback, feedback_data, source="glass", speaker="glass")
                LOGGER.info(f"[Feedback] Completed for {utterance_id}")
                
                # Mark important event if substantial feedback
                if structured_payload and structured_payload.get("target_text"):
                    self.mark_important_event("feedback_correction")
            else:
                LOGGER.info(f"[Feedback] Skipped for {utterance_id}")
        except Exception as e:
            LOGGER.error(f"[Feedback] Failed for {utterance_id}: {e}", exc_info=True)

    async def emit_ai_response(
        self,
        text: str,
        utterance_id: str,
        tail: list[dict],
        event_type_transcript,
        event_type_translation,
        event_type_suggestion,
        user_message_end_time: float | None = None,
    ) -> dict | None:
        """Emit AI response in practice mode with optimized context."""
        try:
            LOGGER.info(f"[AI Response] Starting for utterance {utterance_id}")
            
            # Get thread context (fast, < 200ms)
            thread_context = ""
            if self.memory and self.user_id:
                thread_context = await self.memory.get_context_for_prompt(
                    thread_id=self.session_id,
                    user_id=self.user_id,
                    scope="thread",
                    timeout=2.0,
                )
            
            target_lang = self._lang_code_to_name(self.learning_lang)
            native_lang = self._lang_code_to_name(self.native_lang)
            
            # Get recent Glass feedback to help AI understand user's intent
            recent_feedback_text = "\n".join([f.get("text", "") for f in self.all_feedback[-3:]]) if self.all_feedback else None
            
            # Generate AI response
            ai_response = await self.llm.generate_ai_response(
                text,
                self.scenario,
                recent_conversation=self._get_recent_conversation(tail),  # Recent 5 messages
                target_lang=target_lang,
                native_lang=native_lang,
                user_context=self.user_context_block,  # Pre-loaded (long-term)
                thread_context=thread_context,  # Real-time (current session)
                recent_feedback=recent_feedback_text,  # Glass feedback to understand user's intent
            )
            
            if not ai_response or not ai_response.strip():
                return None
            
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
            try:
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
            except Exception:
                pass
            
            LOGGER.info(f"[AI Response] Completed for {utterance_id}")
            
            # Return message for tail/conversation storage
            return {"speaker": "ai", "source": "ai", "text": ai_response, "utterance_id": ai_utterance_id}
        except Exception as e:
            LOGGER.error(f"[AI Response] Failed for {utterance_id}: {e}", exc_info=True)
            return None

    async def emit_suggestion(
        self,
        utterance_id: str | None,
        tail: list[dict],
        event_type,
        user_hint: str | None = None,
    ) -> None:
        """Emit a suggestion for what to say next with hybrid context."""
        try:
            LOGGER.info(f"[Suggestion] Starting{f' with hint: {user_hint}' if user_hint else ''}")

            # Deduplicate
            dedupe_key = f"{utterance_id or 'unknown'}:{user_hint or 'auto'}"
            if not self._dedupe_once(dedupe_key):
                LOGGER.info(f"[Suggestion] Skipped duplicate for {dedupe_key}")
                return

            target_lang_name = self._lang_code_to_name(self.learning_lang)
            native_lang_name = self._lang_code_to_name(self.native_lang)

            # Get hybrid context (user + thread) for personalized suggestions
            thread_context = ""
            if self.memory and self.user_id:
                context_tasks = [
                    self.memory.get_context_for_prompt(
                        thread_id=self.session_id,
                        user_id=self.user_id,
                        scope="thread",
                        timeout=2.0,
                    ),
                ]
                
                results = await asyncio.gather(*context_tasks, return_exceptions=True)
                thread_context = results[0] if not isinstance(results[0], Exception) else ""  # type: ignore[assignment]

            # Generate suggestion
            result: dict | None = None
            try:
                async with self._llm_gate:
                    result = await self.llm.suggest(
                        recent_conversation=self._get_recent_conversation(tail),
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        user_hint=user_hint,
                        user_context=self.user_context_block,  # Pre-loaded
                        thread_context=thread_context,  # Real-time
                        length_mode=self.suggest_length_mode,  # 'auto', 'short', or 'long'
                    )
            except Exception as e:
                LOGGER.error(f"[Suggestion] Failed: {e}", exc_info=True)
                return

            if not result:
                LOGGER.info("[Suggestion] No result from LLM")
                return

            if result and result.get("target_text"):
                # Ensure pronunciation if user needs it (proficiency == 'cant_read')
                suggestion_obj = await self._ensure_pronunciation(result)
                
                # Store as last suggestion for next feedback comparison
                self._last_suggestion = suggestion_obj.copy()
                
                # Emit as Glass learning assistant for memory tracking
                await self._emit(
                    event_type,
                    {
                        "text": suggestion_obj["target_text"],
                        "suggestion": suggestion_obj,
                        "auto": user_hint is None,  # Auto if no hint, manual if hint provided
                    },
                    source="glass",
                    speaker="glass",
                )
                LOGGER.info(f"[Suggestion] Emitted and stored: {suggestion_obj['target_text'][:50]}...")
        except Exception as e:
            LOGGER.error(f"[Suggestion] Failed: {e}", exc_info=True)

    async def analyze_conversation(
        self, 
        full_conversation: list[dict], 
        all_feedback: list[dict],
        native_lang: str,
        learning_lang: str,
    ) -> dict:
        """Analyze conversation and return scores and feedback using parallel LLM calls.
        
        Note: Memory extraction is handled by Zep, not by our LLM.
        This method only evaluates conversation quality (scores + feedback).
        """
        if not full_conversation:
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "overall_feedback": "No conversation data to analyze.",
            }
        
        # Check if there are any user utterances
        user_utterances = [msg for msg in full_conversation if msg.get("speaker") == "user" or msg.get("source") == "mic"]
        has_user_utterances = len(user_utterances) > 0
        
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
        
        # If no user utterances, return early with appropriate message
        if not has_user_utterances:
            no_utterance_messages = {
                'ko': "사용자 발화가 없어 평가할 수 없어요. 다음에는 대화에 참여해보세요!",
                'en': "No user utterances to evaluate. Try speaking next time!",
                'ja': "ユーザーの発話がないため評価できません。次回は会話に参加してみてください！",
                'zh': "没有用户发言，无法评估。下次试着参与对话吧！",
                'es': "No hay expresiones de usuario para evaluar. ¡Intenta hablar la próxima vez!",
                'fr': "Aucune parole d'utilisateur à évaluer. Essayez de parler la prochaine fois !",
            }
            feedback_msg = no_utterance_messages.get(native_lang, no_utterance_messages['en'])
            
            LOGGER.info("[Analysis] No user utterances found, returning default message")
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "feedback": feedback_msg,
            }
        
        # Run two parallel LLM calls: scores + feedback
        # Memory extraction removed - Zep handles this automatically
        tasks = [
            self._analyze_scores(transcript, feedback_summary, native_lang_name, learning_lang_name),
            self._analyze_feedback(transcript, feedback_summary, native_lang_name, learning_lang_name),
        ]
        
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Combine results
            scores = results[0] if not isinstance(results[0], Exception) else {"fluency": 0, "accuracy": 0, "comprehensibility": 0}
            feedback = results[1] if not isinstance(results[1], Exception) else "Analysis incomplete"
            
            return {
                "scores": scores,
                "feedback": feedback,
            }
        except Exception as e:
            LOGGER.error(f"Failed to analyze conversation: {e}", exc_info=True)
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "feedback": f"Analysis failed: {str(e)}",
            }
    
    async def _analyze_scores(self, transcript: str, feedback_summary: str, native_lang_name: str, learning_lang_name: str) -> dict:
        """Analyze and score the conversation."""
        prompt = f"""You are evaluating a language learning conversation. The user is learning {learning_lang_name}.

Conversation transcript:
{transcript}

Feedback given during conversation:
{feedback_summary or 'No feedback was given.'}

IMPORTANT: 
- This is SPOKEN conversation transcribed by speech-to-text. DO NOT criticize punctuation or capitalization
- Evaluate ONLY the learner's utterances (speaker 'user' / microphone-origin)
- If there are ZERO learner utterances, return all scores as 0
- Output STRICT JSON ONLY. Numbers must be numbers (not strings).

Provide scores (0-100 scale):
- Fluency: How smoothly and naturally the user spoke
- Accuracy: Grammar, vocabulary, and pronunciation correctness
- Comprehensibility: How easy it was to understand the user

Format:
{{
  "fluency": <number 0-100>,
  "accuracy": <number 0-100>,
  "comprehensibility": <number 0-100>
}}"""
        
        try:
            settings = get_settings()
            analysis_model = getattr(settings, "openai_analysis_model", None) or "gpt-5-mini"
            response = await self.llm.generate_text(prompt, model=analysis_model)
            import json
            import re
            json_match = re.search(r'\{[\s\S]*?\}', response)
            if json_match:
                return json.loads(json_match.group())
            return {"fluency": 70, "accuracy": 75, "comprehensibility": 80}
        except Exception as e:
            LOGGER.error(f"Failed to analyze scores: {e}", exc_info=True)
            return {"fluency": 0, "accuracy": 0, "comprehensibility": 0}
    
    async def _analyze_feedback(self, transcript: str, feedback_summary: str, native_lang_name: str, learning_lang_name: str) -> str:
        """Generate overall feedback for the conversation."""
        prompt = f"""You are a language teacher providing feedback on a conversation. The student is learning {learning_lang_name} and their native language is {native_lang_name}.

Conversation transcript:
{transcript}

Feedback given during conversation:
{feedback_summary or 'No feedback was given.'}

IMPORTANT:
- This is SPOKEN conversation transcribed by speech-to-text. DO NOT criticize punctuation or capitalization
- Focus on: vocabulary choice, grammar patterns, natural expression, conversation flow
- Evaluate ONLY the learner's utterances (speaker 'user' / microphone-origin)
- If there are ZERO learner utterances, return: "사용자 발화가 없어 평가할 수 없어요."
- Write in {native_lang_name}
- Be warm, encouraging, and natural, but concise (3-5 sentences)
- Discuss strengths and one or two concrete improvement tips
- Speak directly to the user in a supportive tone

Write conversational feedback (plain text, not JSON):"""
        
        try:
            settings = get_settings()
            analysis_model = getattr(settings, "openai_analysis_model", None) or "gpt-5-mini"
            response = await self.llm.generate_text(prompt, model=analysis_model)
            return response.strip()
        except Exception as e:
            LOGGER.error(f"Failed to generate feedback: {e}", exc_info=True)
            return "Failed to generate feedback."

    # --- Small helpers to keep unified suggestion readable -----------------
    @staticmethod
    def _dedupe_key(anchor_utterance_id: str | None, kind: str) -> str:
        return f"{(anchor_utterance_id or 'unknown')}:{kind}"

    def _dedupe_once(self, key: str) -> bool:
        if key in self._suggested_for:
            return False
        self._suggested_for.add(key)
        return True

    def _get_language_params(self) -> tuple[str, str, str | None]:
        target_lang_name = self._lang_code_to_name(self.learning_lang)
        native_lang_name = self._lang_code_to_name(self.native_lang)
        require_pronunciation = self.proficiency == 'cant_read'
        pronunciation_mode = self.pronunciation_mode if require_pronunciation else None
        return target_lang_name, native_lang_name, pronunciation_mode

    async def _ensure_pronunciation(self, out: dict) -> dict:
        """Ensure pronunciation is attached when required."""
        try:
            target_lang_name, native_lang_name, pronunciation_mode = self._get_language_params()
            LOGGER.debug(f"[Pronunciation] Check - proficiency={self.proficiency}, mode={pronunciation_mode}")
            
            if (
                pronunciation_mode
                and isinstance(out, dict)
                and out.get("target_text")
            ):
                # If pronunciation missing, fetch it
                if not out.get("pronunciation"):
                    LOGGER.info(f"[Pronunciation] Generating for: {out['target_text'][:50]}...")
                    try:
                        pron = await self.llm.generate_pronunciation(
                            out["target_text"],
                            native_lang=native_lang_name,
                            target_lang=target_lang_name,
                            mode=pronunciation_mode or "native",
                        )
                        if pron:
                            out["pronunciation"] = pron
                            LOGGER.info(f"[Pronunciation] Generated: {pron[:50]}...")
                        else:
                            LOGGER.warning("[Pronunciation] Empty result from LLM")
                    except Exception as e:
                        LOGGER.error(f"[Pronunciation] Generation failed: {e}", exc_info=True)
                else:
                    LOGGER.debug(f"[Pronunciation] Already exists: {out.get('pronunciation', '')[:50]}")
            else:
                if not pronunciation_mode:
                    LOGGER.debug("[Pronunciation] Skipped - mode is None")
                elif not out.get("target_text"):
                    LOGGER.warning("[Pronunciation] Skipped - no target_text")
        except Exception as e:
            LOGGER.error(f"[Pronunciation] Unexpected error: {e}", exc_info=True)
        return out

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


