"""Learning assistant for translations, feedback, and suggestions."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Iterable

from . import prompts
from ..schemas import ConversationScores, FeedbackResponse, SuggestionResponse
from ..utils.language import lang_code_to_name

if TYPE_CHECKING:
    from .ports import LLMPort

LOGGER = logging.getLogger(__name__)

RecentConversationEntry = dict[str, Any] | str
RecentConversation = Iterable[RecentConversationEntry] | str | None


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
        self.language_level: str | None = None
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
            if self.mode in ("roleplay", "live_call"):
                target_lang = lang_code_to_name(self.native_lang)
            else:
                target_lang = lang_code_to_name(self.learning_lang if is_user else self.native_lang)

            LOGGER.info(f"[Translation] Starting for utterance {utterance_id}")

            try:
                # Build translation prompt
                system_prompt, user_prompt = prompts.build_translation_prompt(text, source_lang, target_lang)
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
        recent_conversation: RecentConversation,
        user_context: str = "",
        last_partner_message: str | None = None,
    ) -> None:
        """Process utterance: translation, feedback, and suggestions."""
        tasks = []

        # 1. Translation (always)
        tasks.append(
            asyncio.create_task(
                self.do_translation(text, utterance_id, source_lang, source, is_user, event_type_translation)
            )
        )

        if is_user and self.feedback_mode != "off":
            tasks.append(
                asyncio.create_task(
                    self.emit_feedback(
                        text,
                        utterance_id,
                        source,
                        event_type_feedback,
                        recent_conversation=recent_conversation,
                    )
                )
            )

        if self.suggest_mode != "off" and not is_user and source != "ai":
            tasks.append(
                asyncio.create_task(
                    self.emit_suggestion(
                        utterance_id=utterance_id,
                        event_type=event_type_suggestion,
                        recent_conversation=recent_conversation,
                        last_partner_message=last_partner_message,
                    )
                )
            )

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def emit_feedback(
        self,
        text: str,
        utterance_id: str,
        source: str,
        event_type_feedback,
        *,
        recent_conversation: RecentConversation,
    ) -> None:
        """Emit feedback for a user utterance."""
        try:
            LOGGER.info(f"[Feedback] Starting for utterance {utterance_id}")

            # Lightweight gating: skip expensive feedback call if not needed in auto mode
            if self.feedback_mode == "auto":
                should_fb = await self._should_emit_feedback_auto(
                    text=text,
                    recent_conversation=recent_conversation,
                )
                if not should_fb:
                    LOGGER.info(f"[Feedback] Gated off by should_feedback for {utterance_id}")
                    return

            # Generate feedback (with last suggestion if available)
            recent_conv_texts = self._recent_conversation_texts(recent_conversation)
            target_lang_name = lang_code_to_name(self.learning_lang)
            native_lang_name = lang_code_to_name(self.native_lang)
            system_prompt, user_prompt = prompts.build_feedback_prompt(
                user_text=text,
                target_lang=target_lang_name,
                native_lang=native_lang_name,
                recent_conversation=recent_conv_texts,
                last_suggestion=self._last_suggestion,
            )

            LOGGER.info(f"[Feedback] SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}")

            response = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.7,
                response_schema=FeedbackResponse,
                schema_context={"TARGET": target_lang_name, "NATIVE": native_lang_name},
            )

            # Clear last suggestion after use (one-time comparison)
            if self._last_suggestion:
                self._last_suggestion = None

            # Parse structured response
            if not isinstance(response, dict):
                LOGGER.warning("[Feedback] Invalid response type, skipping")
                return

            parsed_error_type = response.get("error_type", "none")
            is_none_error = parsed_error_type == "none"
            reason = response.get("reason_native", "").strip()
            target_text = response.get("target_text", "").strip()

            # Build display text and payload
            display_text = reason if reason else target_text
            structured_payload: dict[str, Any] | None = None

            if not is_none_error and (target_text or reason):
                payload: dict[str, Any] = {}
                if target_text:
                    payload["target_text"] = target_text
                if reason:
                    payload["reason_native"] = reason
                if parsed_error_type:
                    payload["error_type"] = parsed_error_type
                payload.setdefault("language_code", self.learning_lang or "en")
                structured_payload = payload

            feedback_text = display_text
            normalized = feedback_text.strip()

            # Handle "always" mode with no feedback case
            if self.feedback_mode == "always" and (not normalized or is_none_error):
                feedback_text = self._default_affirmation(self.native_lang)
                normalized = feedback_text.strip()
                structured_payload = None
                LOGGER.info(f"[Feedback] Using default affirmation: {feedback_text}")

            # Emit based on mode
            should_emit = bool(normalized) and (
                self.feedback_mode == "always" or (self.feedback_mode == "auto" and not is_none_error)
            )

            LOGGER.info(
                f"[Feedback] Decision - should_emit: {should_emit}, normalized: '{normalized[:50]}...', mode: {self.feedback_mode}"
            )

            if should_emit:
                # Ensure pronunciation for feedback corrections if needed (do this before emit)
                if structured_payload and structured_payload.get("target_text"):
                    structured_payload = await self._ensure_pronunciation(structured_payload)
                    # Preserve explicit error type for downstream consumers
                    if parsed_error_type:
                        structured_payload.setdefault("error_type", parsed_error_type)
                    structured_payload.setdefault("language_code", self.learning_lang or self.default_lang)
                elif parsed_error_type and structured_payload:
                    structured_payload.setdefault("error_type", parsed_error_type)

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
        recent_conversation: RecentConversation,
    ) -> bool:
        """Decide whether to emit feedback in auto mode."""
        fallback = self._feedback_heuristic(text)
        try:
            recent_conv_texts = self._recent_conversation_texts(recent_conversation)
            async with self._llm_gate:
                gate_prompt = prompts.build_feedback_gate_prompt(text, recent_conv_texts)
                response = await self.llm.call(
                    prompt=gate_prompt,
                    temperature=0.3,
                )
        except Exception:
            return fallback

        normalized = (response or "").strip().upper()
        if "YES" in normalized:
            return True
        if "NO" in normalized:
            return fallback
        # Ambiguous response -> rely on heuristics
        return fallback

    @staticmethod
    def _recent_conversation_texts(recent_conversation: RecentConversation) -> list[str]:
        """Normalize recent conversation data into plain text snippets."""
        if recent_conversation is None:
            return []
        if isinstance(recent_conversation, str):
            entries = recent_conversation.splitlines()
        else:
            entries = recent_conversation
        texts: list[str] = []
        for entry in entries:
            if isinstance(entry, dict):
                text = (entry.get("text") or "").strip()
            else:
                text = str(entry).strip()
            if text:
                texts.append(text)
        return texts

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
        recent_conversation: RecentConversation,
        user_hint: str | None = None,
        last_partner_message: str | None = None,
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
                    recent_conv_texts = self._recent_conversation_texts(recent_conversation)
                    system_prompt, user_prompt = prompts.build_suggestion_prompt(
                        target_lang=target_lang_name,
                        native_lang=native_lang_name,
                        user_hint=user_hint,
                        recent_conversation=recent_conv_texts,
                        last_partner_message=last_partner_message,
                        length_mode=self.suggest_length_mode,
                    )

                    LOGGER.info(f"[Suggestion] SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}")

                    response = await self.llm.call(
                        prompt=user_prompt,
                        system=system_prompt,
                        temperature=0.7,
                        response_schema=SuggestionResponse,
                        schema_context={"TARGET": target_lang_name, "NATIVE": native_lang_name},
                    )
                    result = response if isinstance(response, dict) else None
            except Exception as e:
                LOGGER.error(f"[Suggestion] Failed: {e}", exc_info=True)
                return

            if not result:
                LOGGER.info("[Suggestion] No result from LLM")
                return

            if result and result.get("target_text"):
                # Ensure pronunciation if the learner requested pronunciation support
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
        conversation_summary: str = "",
    ) -> dict:
        """Analyze conversation and return scores and feedback using parallel LLM calls.

        Note: Durable memory extraction is handled by the backend memory service.
        This method only evaluates conversation quality (scores + feedback).
        """
        if not full_conversation:
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "overall_feedback": "No conversation data to analyze.",
            }

        def _is_user_message(message: dict) -> bool:
            role = (message.get("role") or message.get("speaker_role") or "").lower()
            source = (message.get("source") or "").lower()
            return role == "user" or source == "mic" or source.startswith("mic")

        # Count user messages
        user_message_count = sum(1 for msg in full_conversation if _is_user_message(msg))
        has_user_utterances = user_message_count > 0

        # Build feedback summary (prioritize important feedback items)
        feedback_summary = ""
        has_feedback = False
        if all_feedback:
            # Sort by importance: grammar/word_choice > pronunciation > fluency > politeness
            importance_order = {
                "grammar": 5,
                "word_choice": 4,
                "pronunciation": 3,
                "fluency": 2,
                "politeness": 1,
                "none": 0,
            }

            def get_importance(fb: dict) -> int:
                fb_type = (fb.get("feedback_type") or "").lower()
                suggestion = fb.get("suggestion") or {}
                error_type = (suggestion.get("error_type") or fb_type or "").lower()
                return importance_order.get(error_type, 0)

            # Sort by importance, take top 20
            sorted_feedback = sorted(all_feedback, key=get_importance, reverse=True)
            top_feedback = sorted_feedback[:20]
            feedback_lines = [f"- {fb.get('text', '')[:150]}" for fb in top_feedback if fb.get("text")]
            if feedback_lines:
                feedback_summary = "\n".join(feedback_lines)
                has_feedback = True

        native_lang_name = lang_code_to_name(native_lang)
        learning_lang_name = lang_code_to_name(learning_lang)

        # If no user utterances, return early with appropriate message
        if not has_user_utterances:
            no_utterance_messages = {
                "ko": "사용자 발화가 없어 평가할 수 없어요. 다음에는 대화에 참여해보세요!",
                "en": "No user utterances to evaluate. Try speaking next time!",
                "ja": "ユーザーの発話がないため評価できません。次回は会話に参加してみてください！",
                "es": "No hay expresiones de usuario para evaluar. ¡Intenta hablar la próxima vez!",
                "fr": "Aucune parole d'utilisateur à évaluer. Essayez de parler la prochaine fois !",
            }
            feedback_msg = no_utterance_messages.get(native_lang, no_utterance_messages["en"])

            LOGGER.info("[Analysis] No user utterances found, returning default message")
            return {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "feedback": feedback_msg,
            }

        # Run two parallel LLM calls: scores + feedback
        # Memory extraction removed - handled centrally after the session
        tasks = [
            self._analyze_scores(feedback_summary, native_lang_name, learning_lang_name),
            self._analyze_feedback(
                feedback_summary,
                native_lang_name,
                learning_lang_name,
                conversation_summary,
                user_message_count,
            ),
        ]

        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Combine results
            scores = (
                results[0]
                if not isinstance(results[0], Exception)
                else {"fluency": 0, "accuracy": 0, "comprehensibility": 0}
            )
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

    async def generate_delayed_feedback(
        self,
        full_conversation: list[dict],
        native_lang: str,
        learning_lang: str,
        *,
        max_items: int = 3,
        history_window: int = 30,
    ) -> list[dict] | None:
        """Produce post-session feedback as structured feedback items (like real-time feedback)."""
        if not full_conversation:
            return None

        # Collect user messages with their utterance IDs
        user_entries: list[tuple[str, str, str | None]] = []  # (utterance_id, text, translation)
        for msg in full_conversation:
            if not isinstance(msg, dict):
                continue
            role = (msg.get("role") or msg.get("speaker_role") or "").lower()
            if role != "user":
                continue
            text = (msg.get("text") or "").strip()
            utterance_id = msg.get("utterance_id")
            if not text or not utterance_id:
                continue
            translation_val = msg.get("translation")
            translation: str | None = None
            if isinstance(translation_val, str):
                translation = translation_val.strip() or None
            elif isinstance(translation_val, dict):
                translation = (translation_val.get("text") or translation_val.get("target_text") or "").strip() or None
            user_entries.append((utterance_id, text, translation))

        if not user_entries:
            return None

        # Take recent entries
        sample_window = max(history_window, max_items)
        recent_entries = user_entries[-sample_window:]
        formatted_lines: list[str] = []
        utterance_id_map: dict[int, str] = {}  # number -> utterance_id

        for idx, (utterance_id, text, translation) in enumerate(recent_entries, start=1):
            utterance_id_map[idx] = utterance_id
            snippet = text if len(text) <= 220 else f"{text[:217]}..."
            line = f"{idx}. {snippet}"
            if translation:
                translated = translation if len(translation) <= 180 else f"{translation[:177]}..."
                line += f"\n   Translation: {translated}"
            formatted_lines.append(line)

        prompt = prompts.build_delayed_feedback_prompt(
            user_utterances="\n".join(formatted_lines),
            learning_lang_name=lang_code_to_name(learning_lang),
            native_lang_name=lang_code_to_name(native_lang),
            max_items=max_items,
        )

        try:
            from ..schemas import DelayedFeedbackResponse

            response = await self.llm.call(
                prompt=prompt,
                temperature=0.4,
                response_schema=DelayedFeedbackResponse,
                schema_context={"TARGET": lang_code_to_name(learning_lang), "NATIVE": lang_code_to_name(native_lang)},
            )
        except Exception as exc:
            LOGGER.error(f"[Feedback] Delayed feedback generation failed: {exc}", exc_info=True)
            return None

        # Convert structured response to feedback items (same format as real-time feedback)
        if not isinstance(response, dict) or not response.get("items"):
            return None

        feedback_items: list[dict] = []
        for item in response.get("items", []):
            if item.get("error_type") == "none":
                continue

            num = item.get("utterance_number")
            utterance_id = utterance_id_map.get(num)
            if not utterance_id:
                continue

            error_type = item.get("error_type", "general")
            reason_native = item.get("reason_native", "").strip()
            target_text = item.get("target_text", "").strip()

            if not reason_native:
                continue

            # Format as real-time feedback item structure
            feedback_item = {
                "utterance_id": utterance_id,
                "text": reason_native,
                "feedback_type": error_type,
                "suggestion": {
                    "error_type": error_type,
                    "reason_native": reason_native,
                    "target_text": target_text,
                },
            }
            feedback_items.append(feedback_item)

        return feedback_items if feedback_items else None

    async def _analyze_scores(self, feedback_summary: str, native_lang_name: str, learning_lang_name: str) -> dict:
        """Analyze and score based on feedback items."""
        prompt = prompts.build_analysis_scores_prompt(feedback_summary, learning_lang_name)

        try:
            response = await self.llm.call(
                prompt=prompt,
                temperature=0.5,
                response_schema=ConversationScores,
            )
            if isinstance(response, dict):
                return response
            return {"fluency": 70, "accuracy": 75, "comprehensibility": 80}
        except Exception as e:
            LOGGER.error(f"Failed to analyze scores: {e}", exc_info=True)
            return {"fluency": 0, "accuracy": 0, "comprehensibility": 0}

    async def _analyze_feedback(
        self,
        feedback_summary: str,
        native_lang_name: str,
        learning_lang_name: str,
        conversation_summary: str = "",
        user_message_count: int = 0,
    ) -> str:
        """Generate overall feedback by synthesizing individual feedback items."""
        prompt = prompts.build_analysis_feedback_prompt(
            feedback_summary, learning_lang_name, native_lang_name, conversation_summary, user_message_count
        )

        LOGGER.info(f"[Overall Feedback Prompt]\n{prompt}")

        try:
            response = await self.llm.call(
                prompt=prompt,
                temperature=0.7,
            )
            return response.strip()
        except Exception as e:
            LOGGER.error(f"Failed to generate feedback: {e}", exc_info=True)
            return "Failed to generate feedback."

    # --- Small helpers to keep unified suggestion readable -----------------
    def _dedupe_once(self, key: str) -> bool:
        if key in self._suggested_for:
            return False
        self._suggested_for.add(key)
        return True

    def _get_language_params(self) -> tuple[str, str, str | None]:
        target_lang_name = lang_code_to_name(self.learning_lang)
        native_lang_name = lang_code_to_name(self.native_lang)
        pron_levels = {"zero", "beginner", "elementary"}
        proficiency_level = (self.language_level or "").lower()
        require_pronunciation = proficiency_level in pron_levels
        # Default to "native" mode if pronunciation is required but no mode is set
        pronunciation_mode = (self.pronunciation_mode or "native") if require_pronunciation else None
        return target_lang_name, native_lang_name, pronunciation_mode

    async def _ensure_pronunciation(self, out: dict) -> dict:
        """Ensure pronunciation is attached when required."""
        try:
            target_lang_name, native_lang_name, pronunciation_mode = self._get_language_params()

            if pronunciation_mode and isinstance(out, dict) and out.get("target_text"):
                # If pronunciation missing, fetch it
                if not out.get("pronunciation"):
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
                        )
                        if pron:
                            out["pronunciation"] = pron
                        else:
                            LOGGER.warning("[Pronunciation] Empty result from LLM")
                    except Exception as e:
                        LOGGER.error(f"[Pronunciation] Generation failed: {e}", exc_info=True)
            else:
                if not out.get("target_text"):
                    LOGGER.warning("[Pronunciation] Skipped - no target_text")
        except Exception as e:
            LOGGER.error(f"[Pronunciation] Unexpected error: {e}", exc_info=True)
        return out

    @staticmethod
    def _default_affirmation(lang_code: str) -> str:
        """Return a short, encouraging default feedback in the user's native language.
        Used when feedback_mode is 'always' but the model indicates no feedback (e.g., error_type 'none').
        """
        messages = {
            "ko": "좋아요! 지금처럼 말해도 자연스러워요.",
            "en": "Great! That sounded natural as is.",
            "ja": "いいですね！今の表現で自然です。",
            "es": "¡Genial! Suena natural tal como está.",
            "fr": "Super ! C’est naturel comme ça.",
        }
        return messages.get(lang_code, "Great! That sounded natural as is.")
