"""OpenAI LLM adapter."""

from __future__ import annotations

from typing import Any, Sequence
import logging

import httpx

from ...domain.prompts import resolve_prompt


class OpenAILLMAdapter:
    """Adapter that calls OpenAI's Responses API for suggestions."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gpt-4.1-mini",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 15.0,
        role: str = "progress",
    ) -> None:
        if not api_key:
            msg = "OpenAI API key is required."
            raise ValueError(msg)
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.role = role
        self._logger = logging.getLogger(__name__)

    async def suggest(
        self,
        transcript_tail: Sequence[str | dict],
        screen: str | None,
        memory: Sequence[dict],
        tone: str,
        lang: str,
    ) -> dict:
        prompt = self._build_prompt(transcript_tail, screen, memory, tone, lang)
        payload = {
            "model": self.model,
            "input": prompt,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/responses", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        text = self._extract_text(data)
        return {"text": text, "tone": tone, "notes": []}

    def _build_prompt(
        self,
        transcript_tail: Sequence[str | dict],
        screen: str | None,
        memory: Sequence[dict],
        tone: str,
        lang: str,
    ) -> list[dict[str, Any]]:
        system_template = resolve_prompt(self.role)["system"]
        system_text = f"{system_template}\nRespond in language: {lang}. Maintain tone: {tone}."
        memory_lines = [
            f"- {item.get('type', 'item')}: {item.get('text', '')}" for item in memory if item.get("text")
        ]
        
        # Format transcript with speaker labels
        transcript_lines = []
        for entry in transcript_tail[-6:]:
            if isinstance(entry, dict):
                speaker = entry.get("speaker", "unknown")
                source = entry.get("source", "")
                text = entry.get("text", "")
                # Robust role mapping to ensure the model sees user's vs partner's turns clearly
                label = self._role_label(speaker, source)
                transcript_lines.append(f"[{label}]: {text}")
            else:
                # Backward compatibility with old string format
                transcript_lines.append(str(entry))
        
        transcript_text = "\n".join(transcript_lines)
        user_parts = [
            "Recent conversation:",
            transcript_text or "(no recent transcript)",
        ]
        if screen:
            user_parts.append(f"Screen: {screen}")
        if memory_lines:
            user_parts.append("Memory:")
            user_parts.extend(memory_lines)
        user_parts.append("\nProvide a single actionable suggestion for what You should say next (under 24 words).")
        user_text = "\n".join(user_parts)

        # Log prompt preview for debugging suggest behavior
        try:
            self._logger.info(
                "[Suggest Prompt]\nLang=%s | Tone=%s\n--- Transcript ---\n%s\n--- Screen ---\n%s\n--- Memory ---\n%s\n--- Instruction ---\n%s",
                lang,
                tone,
                transcript_text or "(none)",
                screen or "(none)",
                ("\n".join(memory_lines)) if memory_lines else "(none)",
                "Provide a single actionable suggestion for what You should say next (under 24 words).",
            )
        except Exception:
            pass
        return [
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": system_text.strip(),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": user_text.strip(),
                    }
                ],
            },
        ]

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text with meaning-focused translation."""
        prompt = f"Translate the following {source_lang} text to {target_lang}. Focus on conveying the meaning naturally, not word-by-word. Only respond with the translation:\n\n{text}"
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1000,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def answer(self, transcript_tail: Sequence[str | dict], lang: str, mode: str = "real", target_lang: str | None = None) -> str:
        """Generate an answer based on conversation history."""
        transcript_lines = self._format_transcript(transcript_tail)
        
        if mode == "practice" and target_lang:
            # In practice mode, suggest how user should respond to AI's question in target language
            prompt = f"""Based on this conversation, the AI partner just asked a question or made a statement.
Suggest how the USER should respond in {target_lang}.

Conversation:
{transcript_lines}

Provide a natural response the user could say in {target_lang} (under 30 words):"""
        else:
            prompt = f"""Based on the following conversation, generate a helpful answer that addresses what was discussed.
Keep it concise (under 30 words) and in {lang}.

Conversation:
{transcript_lines}

Provide an appropriate response:"""
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 100,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def follow_up(self, transcript_tail: Sequence[str | dict], lang: str) -> str:
        """Suggest a follow-up based on what the user previously said."""
        transcript_lines = self._format_transcript(transcript_tail)
        
        prompt = f"""Based on the conversation below, suggest what the user (You/Mic) could say next to continue their previous point.
Keep it natural and concise (under 30 words) and in {lang}.

Conversation:
{transcript_lines}

Suggest a follow-up:"""
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 100,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def answer_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict:
        """Return a structured suggestion with target sentence and simple pronunciation line.

        Output schema:
        {
          "target_text": string,                 # sentence in target_lang
          "native_translation": string | undefined,
          "pronunciation": string | undefined    # one-line reading (e.g., romaji or Hangul)
        }
        """
        transcript_lines = self._format_transcript(transcript_tail)

        if pronunciation_mode == 'romaji':
            pronunciation_rule = (
                "Include a single field 'pronunciation' which is ONE LINE of Hepburn romaji. "
                "ASCII only (no macrons). NEVER use kana/kanji or any non-ASCII."
            )
        elif pronunciation_mode == 'native':
            example_hint = self._build_pronunciation_example(native_lang, target_lang)
            pronunciation_rule = (
                f"Include a single field 'pronunciation' which is ONE LINE showing how to pronounce target_text using {native_lang} script. "
                f"This is a PHONETIC TRANSCRIPTION (not a translation). "
                f"You MUST write the sounds using {native_lang} alphabet/characters, NEVER {target_lang} script. "
                f"{example_hint}"
            )
        else:
            pronunciation_rule = "Do not include a pronunciation field."

        prompt = f"""
You are a precise language coach.

Based on the conversation below, suggest ONE natural sentence the user could say in {target_lang}.

Return STRICT JSON only with keys:
- "target_text": the sentence in {target_lang} (<= 30 words)
- "native_translation": natural translation in {native_lang}
{"- \"pronunciation\": ONE-LINE phonetic reading of target_text (NOT a translation)" if pronunciation_mode else ""}

Rules:
- Output JSON only. No backticks, no prefixes, no prose.
- Keep culturally appropriate tone (polite when needed). If {target_lang} is Japanese, default to polite unless clearly casual.
- {pronunciation_rule}
- CRITICAL: Pronunciation represents SOUNDS (phonetic), never meaning. Write sounds using the specified script ONLY.
- If pronunciation duplicates native_translation or target_text exactly, omit it.
- Do NOT drop punctuation. Preserve commas, periods, exclamation/question marks exactly as in target_text.

Conversation:
{transcript_lines}

JSON:
"""

        # Log answer prompt preview for debugging
        try:
            self._logger.info(
                "[Answer Prompt]\nTarget=%s | Native=%s | PronunciationMode=%s\n--- Transcript ---\n%s\n--- Prompt ---\n%s",
                target_lang,
                native_lang,
                pronunciation_mode or "(none)",
                transcript_lines or "(none)",
                prompt.strip(),
            )
        except Exception:
            pass

        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": "You output only strict JSON matching the requested schema."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1000,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        import json as _json
        try:
            parsed = _json.loads(content)
            if isinstance(parsed, dict):
                # Normalize keys and ensure required fields exist
                target_text = str(parsed.get("target_text") or "").strip()
                native_translation = str(parsed.get("native_translation") or "").strip()
                pronunciation = parsed.get("pronunciation")
                out: dict = {"target_text": target_text}
                if native_translation:
                    out["native_translation"] = native_translation
                if pronunciation:
                    out["pronunciation"] = str(pronunciation).strip()
                return out
        except Exception:
            pass

        # Fallback to unstructured answer
        plain = await self.answer(transcript_tail, lang=target_lang)
        return {"target_text": plain}

    async def follow_up_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict:
        """Return a structured follow-up suggestion with optional one-line pronunciation."""
        transcript_lines = self._format_transcript(transcript_tail)

        if pronunciation_mode == 'romaji':
            pronunciation_rule = (
                "Include a single field 'pronunciation' which is ONE LINE of Hepburn romaji. "
                "ASCII only (no macrons). NEVER use kana/kanji or any non-ASCII."
            )
        elif pronunciation_mode == 'native':
            example_hint = self._build_pronunciation_example(native_lang, target_lang)
            pronunciation_rule = (
                f"Include a single field 'pronunciation' which is ONE LINE showing how to pronounce target_text using {native_lang} script. "
                f"This is a PHONETIC TRANSCRIPTION (not a translation). "
                f"You MUST write the sounds using {native_lang} alphabet/characters, NEVER {target_lang} script. "
                f"{example_hint}"
            )
        else:
            pronunciation_rule = "Do not include a pronunciation field."

        prompt = f"""
You are a precise language coach.

Based on the conversation below, suggest ONE short follow-up sentence the user could say next in {target_lang} to continue the conversation smoothly.

Return STRICT JSON only with keys:
- "target_text": the sentence in {target_lang} (<= 30 words)
- "native_translation": natural translation in {native_lang}
{"- \"pronunciation\": ONE-LINE phonetic reading of target_text (NOT a translation)" if pronunciation_mode else ""}

Rules:
- Output JSON only. No backticks, no prefixes, no prose.
- Keep culturally appropriate tone; default to polite Japanese unless clearly casual.
- {pronunciation_rule}
- CRITICAL: Pronunciation represents SOUNDS (phonetic), never meaning. Write sounds using the specified script ONLY.
- If pronunciation duplicates native_translation or target_text exactly, omit it.
- Do NOT drop punctuation. Preserve commas, periods, exclamation/question marks exactly as in target_text.

Conversation:
{transcript_lines}

JSON:
"""

        # Log follow-up prompt preview for debugging
        try:
            self._logger.info(
                "[FollowUp Prompt]\nTarget=%s | Native=%s | PronunciationMode=%s\n--- Transcript ---\n%s\n--- Prompt ---\n%s",
                target_lang,
                native_lang,
                pronunciation_mode or "(none)",
                transcript_lines or "(none)",
                prompt.strip(),
            )
        except Exception:
            pass

        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": "You output only strict JSON matching the requested schema."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1000,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        import json as _json
        try:
            parsed = _json.loads(content)
            if isinstance(parsed, dict):
                target_text = str(parsed.get("target_text") or "").strip()
                native_translation = str(parsed.get("native_translation") or "").strip()
                pronunciation = parsed.get("pronunciation")
                out: dict = {"target_text": target_text}
                if native_translation:
                    out["native_translation"] = native_translation
                if pronunciation:
                    out["pronunciation"] = str(pronunciation).strip()
                return out
        except Exception:
            pass

        # Fallback to unstructured follow-up
        plain = await self.follow_up(transcript_tail, lang=target_lang)
        return {"target_text": plain}

    def _build_pronunciation_example(self, native_lang: str, target_lang: str) -> str:
        """Return a concise, native-language-specific example hint for pronunciation.

        The hint illustrates how to render SOUNDS using the learner's native script.
        Keep it short and language-appropriate.
        """
        try:
            lang = (native_lang or "").strip().lower()
            # Default generic example (safe fallback in ASCII)
            generic = (
                "Example: Write the sounds in your native script, e.g., split syllables naturally (no translation)."
            )

            if lang == "korean":
                return (
                    "Example: If target is Japanese '行きましょう', write '이키마쇼' (Hangul for sounds)."
                )
            if lang == "english":
                return (
                    "Example: If target is Japanese '行きましょう', write 'ee-kee-mah-shoh' (plain Latin letters)."
                )
            if lang == "japanese":
                return (
                    "Example: If target is English 'thank you', write 'サンキュー' (katakana for sounds)."
                )
            if lang == "chinese":
                return (
                    "Example: Use Hanyu Pinyin for sounds, e.g., English 'hello' → 'ha lou' (ASCII)."
                )
            if lang == "spanish":
                return (
                    "Example: Use plain Latin letters for sounds, e.g., 'ee-kee-mah-shoh'."
                )
            if lang == "french":
                return (
                    "Example: Use plain Latin letters for sounds, e.g., 'i-ki-ma-sho'."
                )
            return generic
        except Exception:
            return (
                "Example: Write sounds using your native script (phonetic, not translation)."
            )

    async def feedback(self, user_text: str, lang: str, target_lang: str | None = None, native_lang: str | None = None, mode: str = "real") -> str:
        """Provide feedback on what the user just said - suggest improvements."""
        if not target_lang:
            target_lang = "English"
        if not native_lang:
            native_lang = "Korean"
        
        if mode == "practice":
            # In practice mode, user is trying to speak in target language
            prompt = f"""The user is practicing {target_lang}. They just said:
"{user_text}"

Provide feedback in {native_lang} ONLY IF there is a CLEAR, HIGH-VALUE improvement (grammar/word choice/register). If the sentence is acceptable/natural enough or corrections are merely stylistic/nitpicky/minor, reply EXACTLY "NONE".

Format when feedback is needed: [Brief reason in {native_lang}] → [Better phrase in {target_lang}]
Examples:
- "완전한 문장으로 말하는 게 더 자연스러워요 → I'd like to check in for my reservation today."
- "과거형을 사용해야 해요 → I went to the store yesterday."
- "관사를 빠뜨리지 마세요 → I need a booking reference."
Say "NONE" if already good or only trivial stylistic changes would be suggested.

Rules:
- Prefer making no suggestion over making a weak one.
- Only suggest if you are at least moderately confident (≥0.7) a learner benefits.
- Keep the whole feedback under 40 words.

Feedback:"""
        else:
            # In real mode, user speaks in native language, wants to know target language
            prompt = f"""The user is learning {target_lang}. They just said something in {native_lang}:
"{user_text}"

Provide a brief explanation and suggestion in {native_lang} showing how to say this in {target_lang} ONLY IF doing so adds clear value. If the utterance is already fine or suggested change is marginal/stylistic, reply EXACTLY "NONE".

Format when feedback is needed: [Brief tip in {native_lang}] → [phrase in {target_lang}]
Examples:
- "예약할 때는 이렇게 말해요 → I'd like to make a reservation for two people."
- "정중하게 요청하려면 → Could you please help me with check-in?"
Say "NONE" if not needed.

Rules:
- Prefer making no suggestion over making a weak one.
- Only suggest if you are at least moderately confident (≥0.7) a learner benefits.
- Keep it under 40 words.

Feedback:"""
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 100,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def should_suggest(
        self,
        transcript_tail: Sequence[str | dict],
        kind: str,
        mode: str = "real",
    ) -> bool:
        """Ask the model to decide whether to surface a suggestion now.

        kind: 'answer' (partner just spoke) or 'follow_up' (user just spoke)
        Return True to show a suggestion, False to skip.
        """
        kind = (kind or "").strip().lower()
        transcript_lines = self._format_transcript(transcript_tail)
        
        if kind == "answer":
            # Partner spoke - suggest answer for user
            prompt = f"""
You are a concise conversation assistant. Decide if the user needs a response suggestion right now.

Guidelines:
- Answer YES if the partner's last message invites a reply, contains a question, opens a new topic, or the user may need help responding.
- Answer NO if the best action is to wait, or the next reply is obvious (e.g., brief acknowledgments), or suggesting would be noisy.
- Be slightly more proactive in practice mode.

Conversation:
{transcript_lines}

Return YES or NO only.
"""
        else:
            # User spoke - suggest follow-up
            prompt = f"""
You are a concise conversation assistant. Decide if the user needs a follow-up suggestion right now.

Guidelines:
- Answer YES if the user made a statement that could naturally be continued or expanded (e.g., shared opinion, made observation, completed thought).
- Answer NO if:
  * The user asked a question (they are waiting for an answer, not looking to add more)
  * The message is brief acknowledgment ("OK", "Thanks", "I see")
  * The user clearly finished their turn and is waiting
  * Suggesting would be noisy or interrupting
- IMPORTANT: If the last message ends with '?' or is clearly a question, always answer NO.

Conversation:
{transcript_lines}

Return YES or NO only.
"""
        if mode == "practice":
            prompt = "[Practice Mode]\n" + prompt
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 10,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        decision = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip().upper()
        try:
            self._logger.info(f"Should suggest: {decision}")
            # Elevate prompt to INFO for easier field debugging
            self._logger.info("[ShouldSuggest Prompt]\nKind=%s | Mode=%s\n--- Transcript ---\n%s\n--- Prompt ---\n%s", kind, mode, transcript_lines, prompt)
        except Exception:
            pass
        return "YES" in decision

    def _format_transcript(self, transcript_tail: Sequence[str | dict]) -> str:
        """Format transcript for prompts."""
        lines = []
        for entry in transcript_tail[-8:]:
            if isinstance(entry, dict):
                speaker = entry.get("speaker", "unknown")
                source = entry.get("source", "")
                text = entry.get("text", "")
                label = self._role_label(speaker, source)
                lines.append(f"[{label}]: {text}")
            else:
                lines.append(str(entry))
        return "\n".join(lines)

    def _role_label(self, speaker: str | None, source: str | None) -> str:
        """Normalize transcript speaker labels to 'You' or 'Partner' when possible.

        Falls back to the provided speaker string if it can't confidently map.
        """
        src = (source or "").strip().lower()
        spk = (speaker or "").strip().lower()

        # Consider any microphone-origin messages as the user
        if src.startswith("mic") or spk == "user":
            return "You"

        # Common partner/remote markers across our stack
        partner_sources = {"ws", "remote", "system", "ai", "server"}
        partner_speakers = {"ai", "remote", "partner"}
        if src in partner_sources or spk in partner_speakers:
            return "Partner"

        # Fallback to the raw speaker, or a generic Partner if missing
        return speaker or "Partner"

    async def generate_ai_response(
        self,
        user_text: str,
        scenario: str | None,
        conversation_history: Sequence[dict],
        target_lang: str,
    ) -> str:
        """Generate AI response for practice mode based on scenario."""
        # Build scenario context
        scenario_context = self._get_scenario_context(scenario)
        
        # Check if this is an initial greeting (empty conversation history)
        is_initial = len(conversation_history) == 0 or user_text.startswith("[")
        
        if is_initial:
            # Generate initial greeting
            prompt = f"""You are an AI language partner helping someone practice {target_lang}.

Scenario: {scenario_context}

This is the start of the conversation. Greet the user naturally in {target_lang} as if you are in this scenario. Keep it brief and welcoming (1-2 sentences).

AI:"""
        else:
            # Build conversation history
            history_text = ""
            for entry in conversation_history[-6:]:  # Last 3 turns
                speaker = entry.get("speaker", "unknown")
                text = entry.get("text", "")
                if speaker == "user":
                    history_text += f"User: {text}\n"
                elif speaker == "ai":
                    history_text += f"AI: {text}\n"
            
            prompt = f"""You are an AI language partner helping someone practice {target_lang}.

Scenario: {scenario_context}

Conversation so far:
{history_text}
User: {user_text}

Respond naturally in {target_lang} as if you are in this scenario. Keep your response conversational and brief (1-2 sentences).

AI:"""

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": f"You are a helpful language practice partner. Always respond in {target_lang}."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 150,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    
    def _get_scenario_context(self, scenario: str | None) -> str:
        """Get scenario description for prompt."""
        if not scenario:
            return "Casual conversation"
        
        if scenario.startswith("custom:"):
            return scenario[7:]  # Remove "custom:" prefix
        
        scenario_map = {
            "airport": "You are a check-in agent at an airport helping a passenger.",
            "restaurant": "You are a server at a restaurant taking an order.",
            "interview": "You are an interviewer conducting a job interview.",
            "shopping": "You are a sales associate helping a customer.",
            "casual": "You are having a casual friendly conversation.",
            "phone": "You are having a phone conversation.",
        }
        return scenario_map.get(scenario, "Casual conversation")

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        output = data.get("output") or []
        if not isinstance(output, list):
            return ""
        parts: list[str] = []
        for segment in output:
            content = segment.get("content") if isinstance(segment, dict) else None
            if not isinstance(content, list):
                continue
            for fragment in content:
                if isinstance(fragment, dict) and fragment.get("type") == "output_text":
                    parts.append(fragment.get("text", ""))
        return " ".join(part.strip() for part in parts if part).strip()

    async def generate_text(self, prompt: str, max_tokens: int = 2000) -> str:
        """Generate text response from a prompt using chat completions."""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()