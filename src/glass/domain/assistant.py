"""Learning assistant for translations, feedback, and suggestions."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from . import prompts
from ..utils.language import lang_code_to_name

if TYPE_CHECKING:
    from .ports import LLMPort

LOGGER = logging.getLogger(__name__)


class LearningAssistant:
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
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"
        self.proficiency: str | None = None
        self.pronunciation_mode: str | None = None
        self.mode: str = "live_call"
        
        # State
        self._translations: dict[str, str] = {}
        self._suggested_for: set[str] = set()
        self.all_feedback: list[dict] = []
        self._last_suggestion: dict | None = None  # Most recent suggestion (for comparison with next user utterance)

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
            if self.mode in ('roleplay', 'live_call'):
                target_lang = lang_code_to_name(self.native_lang)
            else:
                target_lang = lang_code_to_name(self.learning_lang if is_user else self.native_lang)
            
            LOGGER.info(f"[Translation] Starting for utterance {utterance_id}")
            
            try:
                # Build translation prompt
                system_prompt, user_prompt = prompts.build_translation_prompt(
                    text, source_lang, target_lang
                )
                # Call LLM (uses adapter's default model)
                translation = await self.llm.call(
                    prompt=user_prompt,
                    system=system_prompt,
                    temperature=0.3,
                )
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
        *,
        recent_conversation: list[dict],
        user_context: str = "",
        thread_context: str = "",
    ) -> None:
        """Process utterance: translation, feedback, and suggestions."""
        tasks = []
        
        # 1. Translation (always)
        tasks.append(asyncio.create_task(
            self.do_translation(text, utterance_id, source_lang, source, is_user, event_type_translation)
        ))
        
        # 2. Feedback (user only, if enabled)
        if is_user and self.feedback_mode != 'off':
            tasks.append(asyncio.create_task(
                self.emit_feedback(
                    text,
                    utterance_id,
                    source,
                    event_type_feedback,
                    recent_conversation=recent_conversation,
                    thread_context=thread_context,
                )
            ))
        
        # 3. Suggestion (if enabled, for partner messages in live_call mode)
        if self.suggest_mode != 'off' and not is_user and source != 'ai':
                tasks.append(asyncio.create_task(
                    self.emit_suggestion(
                        utterance_id=utterance_id,
                        event_type=event_type_suggestion,
                    recent_conversation=recent_conversation,
                    user_context=user_context,
                    thread_context=thread_context,
                    )
                ))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def emit_feedback(
        self,
        text: str,
        utterance_id: str,
        source: str,
        event_type_feedback,
        *,
        recent_conversation: list[dict],
        thread_context: str = "",
    ) -> None:
        """Emit feedback for a user utterance."""
        try:
            LOGGER.info(f"[Feedback] Starting for utterance {utterance_id}")
            
            # Lightweight gating: skip expensive feedback call if not needed in auto mode
            if self.feedback_mode == 'auto':
                should_fb = await self._should_emit_feedback_auto(
                    text=text,
                    recent_conversation=recent_conversation,
                )
                if not should_fb:
                    LOGGER.info(f"[Feedback] Gated off by should_feedback for {utterance_id}")
                    return
            
            # Generate feedback (with last suggestion if available)
            recent_conv_texts = [msg.get("text", "") for msg in recent_conversation]
            system_prompt, user_prompt = prompts.build_feedback_prompt(
                user_text=text,
                target_lang=lang_code_to_name(self.learning_lang),
                native_lang=lang_code_to_name(self.native_lang),
                recent_conversation=recent_conv_texts,
                last_suggestion=self._last_suggestion,
                thread_context=thread_context,
            )
            feedback_text = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.7,
                max_tokens=500,
                json_mode=True,
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
                await self._emit(event_type_feedback, feedback_data, source="glass")
                LOGGER.info(f"[Feedback] Completed for {utterance_id}")
            else:
                LOGGER.info(f"[Feedback] Skipped for {utterance_id}")
        except Exception as e:
            LOGGER.error(f"[Feedback] Failed for {utterance_id}: {e}", exc_info=True)

    async def _should_emit_feedback_auto(
        self,
        text: str,
        recent_conversation: list[dict],
    ) -> bool:
        """Decide whether to emit feedback in auto mode."""
        fallback = self._feedback_heuristic(text)
        try:
            async with self._llm_gate:
                gate_prompt = prompts.build_feedback_gate_prompt(
                    text,
                    [msg.get("text", "") for msg in recent_conversation],
                )
                response = await self.llm.call(
                    prompt=gate_prompt,
                    temperature=0.3,
                    max_tokens=50,
                )
        except Exception as exc:
            LOGGER.debug(f"[Feedback] Gate prompt failed, using heuristic: {exc}")
            return fallback

        normalized = (response or "").strip().upper()
        if "YES" in normalized:
            return True
        if "NO" in normalized:
            LOGGER.debug(f"[Feedback] Gate returned NO; fallback heuristic={fallback}")
            return fallback
        # Ambiguous response -> rely on heuristics
        LOGGER.debug(f"[Feedback] Gate ambiguous ('{normalized}'), using heuristic={fallback}")
        return fallback

    @staticmethod
    def _feedback_heuristic(text: str) -> bool:
        """Simple heuristic to decide if feedback is likely needed."""
        words = (text or "").strip().split()
        if len(words) >= 4:
            return True
        # Long phrases without spaces (e.g., STT glitches) still deserve feedback
        return len((text or "").strip()) >= 20

    async def emit_suggestion(
        self,
        utterance_id: str | None,
        event_type,
        *,
        recent_conversation: list[dict],
        user_context: str = "",
        thread_context: str = "",
        user_hint: str | None = None,
    ) -> None:
        """Emit a suggestion for what to say next."""
        try:
            LOGGER.info(f"[Suggestion] Starting{f' with hint: {user_hint}' if user_hint else ''}")

            # Deduplicate
            dedupe_key = f"{utterance_id or 'unknown'}:{user_hint or 'auto'}"
            if not self._dedupe_once(dedupe_key):
                LOGGER.info(f"[Suggestion] Skipped duplicate for {dedupe_key}")
                return

            target_lang_name = lang_code_to_name(self.learning_lang)
            native_lang_name = lang_code_to_name(self.native_lang)

            # Generate suggestion
            result: dict | None = None
            try:
                async with self._llm_gate:
                    recent_conv_texts = [msg.get("text", "") for msg in recent_conversation]
                    system_prompt, user_prompt = prompts.build_suggestion_prompt(
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        user_hint=user_hint,
                        recent_conversation=recent_conv_texts,
                        user_context=user_context,
                        thread_context=thread_context,
                        length_mode=self.suggest_length_mode,
                    )
                    response = await self.llm.call(
                        prompt=user_prompt,
                        system=system_prompt,
                        temperature=0.7,
                        max_tokens=500,
                        json_mode=True,
                    )
                    # Parse JSON response
                    import json
                    result = json.loads(response) if response else None
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
        
        def _is_user_message(message: dict) -> bool:
            role = (
                message.get("role")
                or message.get("speaker_role")
                or ""
            ).lower()
            source = (message.get("source") or "").lower()
            return role == "user" or source == "mic" or source.startswith("mic")
        
        # Check if there are any user utterances
        has_user_utterances = any(_is_user_message(msg) for msg in full_conversation)
        
        # Build transcript
        def _speaker_label(message: dict) -> str:
            role = (
                message.get("role")
                or message.get("speaker_role")
                or ""
            ).lower()
            speaker_id = (
                message.get("partner_id")
                or message.get("speaker_id")
                or ""
            ).lower()
            if role == "user":
                return "You"
            if role == "assistant" or speaker_id == "glass":
                return "Glass"
            if role == "partner":
                return "Partner"
            return "Partner"
        
        transcript_lines = []
        for msg in full_conversation:
            speaker_label = _speaker_label(msg)
            text = msg.get("text", "")
            transcript_lines.append(f"{speaker_label}: {text}")
        transcript = "\n".join(transcript_lines)
        
        # Build feedback summary
        feedback_summary = ""
        if all_feedback:
            feedback_lines = [f"- {fb.get('text', '')}" for fb in all_feedback]
            feedback_summary = "\n".join(feedback_lines)
        
        native_lang_name = lang_code_to_name(native_lang)
        learning_lang_name = lang_code_to_name(learning_lang)
        
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
        prompt = prompts.build_analysis_scores_prompt(transcript, feedback_summary, learning_lang_name)
        
        try:
            response = await self.llm.call(
                prompt=prompt,
                temperature=0.5,
                max_tokens=200,
            )
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
        prompt = prompts.build_analysis_feedback_prompt(transcript, feedback_summary, learning_lang_name, native_lang_name)
        
        try:
            response = await self.llm.call(
                prompt=prompt,
                temperature=0.7,
                max_tokens=500,
            )
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
        target_lang_name = lang_code_to_name(self.learning_lang)
        native_lang_name = lang_code_to_name(self.native_lang)
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
                        system_prompt, user_prompt = prompts.build_pronunciation_prompt(
                            out["target_text"],
                            native_lang=native_lang_name,
                            target_lang=target_lang_name,
                            mode=pronunciation_mode or "native",
                        )
                        pron = await self.llm.call(
                            prompt=user_prompt,
                            system=system_prompt,
                            temperature=0.3,
                            max_tokens=100,
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
