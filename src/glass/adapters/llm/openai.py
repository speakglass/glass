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
        # For GPT-5 family models, request lower reasoning effort for faster responses
        try:
            if str(self.model).startswith("gpt-5"):
                payload["reasoning"] = {"effort": "low"}
        except Exception:
            pass
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

    async def translate_structured(
        self,
        text: str,
        *,
        source_lang: str,
        target_lang: str,
        pronunciation_mode: str | None = None,
        context: Sequence[str | dict] | None = None,
    ) -> dict:
        """Translate text with structured output including pronunciation.
        
        Args:
            text: Input text (keywords or full sentence) to translate
            source_lang: Source language name
            target_lang: Target language name
            pronunciation_mode: 'romaji' or 'native' for pronunciation
            context: Optional conversation context for better translation
        
        Returns:
            dict with target_text, native_translation (back-translation), pronunciation
        """
        # Build context if provided
        context_text = ""
        if context:
            context_lines = self._format_transcript(context[-4:])  # Last 2 turns
            context_text = f"\nConversation context:\n{context_lines}\n"

        if pronunciation_mode == 'romaji':
            example = self._get_romanization_example(target_lang)
            pronunciation_rule = f"Include 'pronunciation' field with ONE line of romanization. Example: {example}"
        elif pronunciation_mode == 'native':
            pronunciation_rule = self._build_pronunciation_rule(source_lang, target_lang)
        else:
            pronunciation_rule = "Do not include a pronunciation field."

        prompt = f"""
You are a translation assistant helping a user learn {target_lang}.

The user provided: "{text}"

This might be:
- Keywords they want to combine into a sentence
- A partial phrase they want completed
- A full sentence they want translated
{context_text}
Your task:
1. If keywords: combine them into a natural, contextually appropriate sentence in {target_lang}
2. If a phrase/sentence: translate it naturally to {target_lang}
3. Keep it conversational and natural

Return STRICT JSON only with keys:
- "target_text": the sentence in {target_lang} (<= 30 words)
- "native_translation": back-translation to {source_lang} (so user can verify meaning)
{"- \"pronunciation\": ONE-LINE phonetic reading of target_text (NOT a translation)" if pronunciation_mode else ""}

Rules:
- Output JSON only. No backticks, no prefixes, no prose.
- Keep culturally appropriate tone (polite when needed).
- {pronunciation_rule}
- CRITICAL: Pronunciation represents SOUNDS (phonetic), never meaning.
- Do NOT drop punctuation. Preserve natural punctuation in target_text.

JSON:
"""

        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": "You output only strict JSON matching the requested schema."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
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

        # Fallback to simple translation
        simple = await self.translate(text, source_lang, target_lang)
        return {"target_text": simple}

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
            example = self._get_romanization_example(target_lang)
            pronunciation_rule = f"Include 'pronunciation' with ONE line of romanization. Example: {example}"
        elif pronunciation_mode == 'native':
            pronunciation_rule = self._build_pronunciation_rule(native_lang, target_lang)
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
            example = self._get_romanization_example(target_lang)
            pronunciation_rule = f"Include 'pronunciation' with ONE line of romanization. Example: {example}"
        elif pronunciation_mode == 'native':
            pronunciation_rule = self._build_pronunciation_rule(native_lang, target_lang)
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

    async def suggest_unified(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
        mode: str = "real",
        suggest_mode: str = "auto",
    ) -> dict:
        """Generate a unified suggestion in one LLM call with type determination.
        
        Returns a dict with:
        - "type": "answer" | "follow_up" | "none"
        - "target_text": the suggested sentence (if type != "none")
        - "native_translation": translation to native language (optional)
        - "pronunciation": phonetic reading (optional)
        """
        transcript_lines = self._format_transcript(transcript_tail)

        if pronunciation_mode == 'romaji':
            example = self._get_romanization_example(target_lang)
            pronunciation_rule = f"Include 'pronunciation' with ONE line of romanization. Example: {example}"
        elif pronunciation_mode == 'native':
            pronunciation_rule = self._build_pronunciation_rule(native_lang, target_lang)
        else:
            pronunciation_rule = "Do not include a pronunciation field."

        # Different prompts based on suggest_mode
        if suggest_mode == "always":
            # Always generate a suggestion, decide between answer and follow_up
            type_instruction = """
Decide which type of suggestion to provide:
- "answer": if the conversation partner's last message invites a direct response or asks a question
- "follow_up": if a new question/statement would help continue the conversation
You MUST return either "answer" or "follow_up", never "none".
"""
        else:
            # Auto mode: can return "none" if suggestion is not helpful
            type_instruction = """
Decide which type of suggestion to provide:
- "answer": if the conversation partner's last message invites a direct response or asks a question
- "follow_up": if a new question/statement would help continue the conversation
- "none": if suggesting now would be redundant or unhelpful
"""

        prompt = f"""
You are a precise language coach helping a user learn {target_lang}.

Based on the conversation below, {type_instruction}

Return STRICT JSON only with keys:
- "type": "answer" | "follow_up" | "none"
- "target_text": the suggested sentence in {target_lang} (<= 30 words) [only if type != "none"]
- "native_translation": natural translation in {native_lang} [only if type != "none"]
{"- \"pronunciation\": ONE-LINE phonetic reading of target_text (NOT a translation) [only if type != \"none\"]" if pronunciation_mode else ""}

Rules:
- Output JSON only. No backticks, no prefixes, no prose.
- If type is "answer", suggest a direct reply to the partner's message.
- If type is "follow_up", suggest a new question or statement to continue the conversation.
- If type is "none", only include the "type" field.
- Keep culturally appropriate tone (polite when needed). If {target_lang} is Japanese, default to polite unless clearly casual.
- {pronunciation_rule}
- CRITICAL: Pronunciation represents SOUNDS (phonetic), never meaning. Write sounds using the specified script ONLY.
- If pronunciation duplicates native_translation or target_text exactly, omit it.
- Do NOT drop punctuation. Preserve commas, periods, exclamation/question marks exactly as in target_text.
{"- Be slightly more proactive in suggesting (prefer answer/follow_up over none)." if mode == "practice" else ""}

Conversation:
{transcript_lines}

JSON:
"""

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
                suggestion_type = str(parsed.get("type", "none")).lower()
                
                if suggestion_type == "none":
                    return {"type": "none"}
                
                # Normalize and validate
                target_text = str(parsed.get("target_text") or "").strip()
                native_translation = str(parsed.get("native_translation") or "").strip()
                pronunciation = parsed.get("pronunciation")
                
                out: dict = {
                    "type": suggestion_type if suggestion_type in ["answer", "follow_up"] else "follow_up",
                    "target_text": target_text
                }
                if native_translation:
                    out["native_translation"] = native_translation
                if pronunciation:
                    out["pronunciation"] = str(pronunciation).strip()
                return out
        except Exception:
            pass

        # Fallback: generate follow_up
        plain = await self.follow_up(transcript_tail, lang=target_lang)
        return {"type": "follow_up", "target_text": plain}

    def _get_pronunciation_example(self, native_lang: str, target_lang: str) -> str:
        """Get concrete pronunciation example for language pair."""
        native = (native_lang or "").strip().lower()
        target = (target_lang or "").strip().lower()
        
        # Complete language pair examples
        examples = {
            # Chinese learners (5 targets)
            ("chinese", "korean"): "Korean '안녕하세요' → 'ān níng hā sāi yō'",
            ("chinese", "japanese"): "Japanese 'ありがとう' → 'ā lǐ gā duō'",
            ("chinese", "english"): "English 'hello' → 'hā lóu'",
            ("chinese", "spanish"): "Spanish 'hola' → 'āo lā'",
            ("chinese", "french"): "French 'bonjour' → 'bāng zhū'",
            
            # Korean learners (5 targets)
            ("korean", "chinese"): "Chinese '你好' → '니하오'",
            ("korean", "japanese"): "Japanese 'ありがとう' → '아리가또'",
            ("korean", "english"): "English 'hello' → '헬로우'",
            ("korean", "spanish"): "Spanish 'gracias' → '그라씨아스'",
            ("korean", "french"): "French 'merci' → '메르씨'",
            
            # Japanese learners (5 targets)
            ("japanese", "chinese"): "Chinese '你好' → 'ニーハオ'",
            ("japanese", "korean"): "Korean '안녕하세요' → 'アンニョンハセヨ'",
            ("japanese", "english"): "English 'thank you' → 'サンキュー'",
            ("japanese", "spanish"): "Spanish 'hola' → 'オラ'",
            ("japanese", "french"): "French 'bonjour' → 'ボンジュール'",
            
            # English learners (5 targets)
            ("english", "chinese"): "Chinese '谢谢' → 'xie-xie'",
            ("english", "korean"): "Korean '감사합니다' → 'gam-sa-ham-ni-da'",
            ("english", "japanese"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
            ("english", "spanish"): "Spanish 'gracias' → 'gra-see-as'",
            ("english", "french"): "French 'merci' → 'mer-see'",
            
            # Spanish learners (5 targets)
            ("spanish", "chinese"): "Chinese '你好' → 'ni jao'",
            ("spanish", "korean"): "Korean '안녕하세요' → 'an-niong-ja-se-io'",
            ("spanish", "japanese"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
            ("spanish", "english"): "English 'hello' → 'je-lou'",
            ("spanish", "french"): "French 'bonjour' → 'bon-yur'",
            
            # French learners (5 targets)
            ("french", "chinese"): "Chinese '你好' → 'ni hao'",
            ("french", "korean"): "Korean '안녕하세요' → 'an-nioung-ha-sé-yo'",
            ("french", "japanese"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
            ("french", "english"): "English 'hello' → 'hé-lo'",
            ("french", "spanish"): "Spanish 'hola' → 'o-la'",
        }
        
        return examples.get((native, target), f"Write sounds in your native script, like '{target}' → (phonetic)")
    
    def _get_romanization_example(self, target_lang: str) -> str:
        """Get romanization example for target language."""
        target = (target_lang or "").strip().lower()
        
        examples = {
            "japanese": "'ありがとう' → 'arigatou'",
            "korean": "'안녕하세요' → 'annyeonghaseyo'",
            "chinese": "'你好' → 'ni hao'",
            "english": "'hello' → 'hello'",
            "spanish": "'gracias' → 'gracias'",
            "french": "'merci' → 'merci'",
        }
        
        return examples.get(target, f"Romanize {target} text")
    
    def _build_pronunciation_rule(self, native_lang: str, target_lang: str) -> str:
        """Build clear, concise pronunciation instruction with example."""
        example = self._get_pronunciation_example(native_lang, target_lang)
        return f"Provide pronunciation in ONE line. Example: {example}"

    def _get_reason_example(self, native_lang: str) -> str:
        """Return a very short, native-language-only feedback style example."""
        lang = (native_lang or "").strip().lower()
        examples = {
            "korean": "조금 어색해요. 이렇게 말해보세요.",
            "english": "A bit unnatural. Try this instead.",
            "japanese": "少し不自然です。こう言いましょう。",
            "chinese": "有点不自然。可以这样说。",
            "spanish": "Suena un poco raro. Mejor así.",
            "french": "Un peu artificiel. Dites plutôt ceci.",
        }
        return examples.get(lang, "Short tip in your native language.")
    async def generate_pronunciation(
        self,
        target_text: str,
        *,
        native_lang: str,
        target_lang: str,
        mode: str | None = None,  # 'romaji' or 'native'
    ) -> str:
        """Generate a one-line pronunciation for target_text.

        Returns a single line string. No translation, no extra prose.
        """
        text = (target_text or "").strip()
        if not text:
            return ""
        native = (native_lang or "").strip()
        target = (target_lang or "").strip()
        system = "Output only a SINGLE LINE with the pronunciation. No translation. No quotes. No extra words."
        if (mode or "").strip().lower() == "romaji":
            example = self._get_romanization_example(target)
            user = f"Romanize this {target} sentence. One line only.\nExample: {example}\n\n{text}"
        else:
            rule = self._build_pronunciation_rule(native, target)
            user = f"{rule}\nWrite sounds using {native} script for this {target} sentence:\n\n{text}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "max_tokens": 60,
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    async def feedback(
        self,
        user_text: str,
        lang: str,
        target_lang: str | None = None,
        native_lang: str | None = None,
        mode: str = "real",
        *,
        include_pronunciation: bool = False,
        pronunciation_mode: str | None = None,
        transcript_tail: Sequence[str | dict] | None = None,
    ) -> str:
        """Provide structured feedback (JSON) on the user's utterance.

        When feedback is needed, returns STRICT JSON string with keys:
          - "reason_native": short conversational feedback in the learner's native language
          - "suggestion_target": corrected/natural phrasing in the target language
          - "pronunciation": OPTIONAL one-line phonetic reading (only when include_pronunciation=True)

        When feedback is NOT needed, returns the plain string "NONE".
        """
        if not target_lang:
            target_lang = "English"
        if not native_lang:
            native_lang = "Korean"

        # Optional short transcript context (last few turns)
        transcript_context = ""
        try:
            if transcript_tail:
                transcript_lines = self._format_transcript(list(transcript_tail))
                if transcript_lines:
                    transcript_context = f"""Recent conversation (last {len(transcript_tail)} turns):\n{transcript_lines}\n\n"""
        except Exception:
            pass
        # System rules: minimal, unambiguous JSON schema (gating handled elsewhere)
        system_rules = (
            "You are a concise speaking coach (STT input). Ignore minor STT noise.\n"
            f"Language policy: reason_native MUST be in {native_lang} only (no {target_lang}/English except quoted terms).\n"
            "Output STRICT JSON with exactly these keys:\n"
            f'- "reason_native": {native_lang}, ≤150 chars; you may quote ≤2 {target_lang} terms in single quotes.\n'
            f'- "suggestion_target": {target_lang} only, ≤15 words.\n'
            "No extra fields. No backticks. No prose outside JSON."
        )

        # User prompt
        user_prompt = (
            f"Native language: {native_lang}\n"
            f"Target language: {target_lang}\n\n"
            f"{transcript_context}"
            f'Utterance: "{user_text}"\n\n'
            "Return STRICT JSON as specified."
        )
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": system_rules},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
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


        # Log prompt preview for debugging suggest behavior
        try:
            self._logger.info(
                "[Feedback Prompt]\nSystem ---\n%s\n\nUser ---\n%s",
                system_rules,
                user_prompt,
            )
        except Exception:
            pass

        # Return raw content (STRICT JSON string when feedback is needed) or 'NONE'
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip() # type: ignore

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
        return "YES" in decision

    async def should_feedback(
        self,
        transcript_tail: Sequence[str | dict],
        user_text: str,
        mode: str = "real",
    ) -> bool:
        """Lightweight gate to decide if we should request feedback for user's utterance.

        Returns True to request feedback, False to skip.
        """
        transcript_lines = self._format_transcript(transcript_tail)
        prompt = f"""
You are a concise speech coach. Decide if the user's last utterance needs feedback now.

Give feedback only when:
- Grammar/conjugation is clearly wrong, OR
- Phrasing blocks understanding, OR
- Pronunciation/clarity likely needs help (stress/linking/vowel/consonant/intonation).

IGNORE: spacing, punctuation, casing, filler words, or tiny STT glitches.

Conversation:
{transcript_lines}

User utterance:
"{user_text}"

Return YES or NO only.
"""
        if mode == "practice":
            prompt = "[Practice Mode]\n" + prompt
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [{"role": "user", "content": prompt}],
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
            style = self._greeting_style(target_lang, scenario_context)
            prompt = f"""You are an AI language partner helping someone practice {target_lang}.

Scenario: {scenario_context}

This is the start of the conversation. Greet the user naturally in {target_lang} for this scenario. Keep it brief (1–2 sentences) and include a simple question to engage.

Style:
{style}

Rules:
- Stay within the scenario context. If the other person says something off-topic or breaks the scenario, gently clarify and steer the conversation back to the scenario in one sentence, then continue with a short, relevant question.
- Keep the tone friendly and natural; avoid sounding robotic or generic.

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

Rules:
- Maintain scenario continuity. If the user's message is off-topic or conflicts with the scenario, politely correct the context in one short sentence and guide the conversation back to the scenario with a brief, relevant question.
- Stay friendly and human; avoid stock phrases.

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

    def _greeting_style(self, target_lang: str, scenario_context: str) -> str:
        """Return small, language-specific style hints for natural first turn."""
        lang = (target_lang or "").strip().lower()
        ctx = (scenario_context or "").lower()
        is_formal = any(k in ctx for k in ["interview", "airport", "office", "check-in", "bank", "agent", "server"])
        is_staff = any(k in ctx for k in ["server", "sales", "associate", "barista", "agent", "check-in"])
        # Korean
        if "korean" in lang or lang == "ko" or "한국어" in lang:
            tone = "자연스럽고 따뜻한 존댓말(요/습니다체)"
            if is_formal or is_staff:
                tone = "정중하고 간결한 존댓말(습니다체)"
            return f"- {tone}로 한두 문장.\n- 상황에 맞춰 가볍게 먼저 묻기(예: 무엇을 도와드릴까요?).\n- 상투적 문구는 피하고 자연스러운 말투."
        # Japanese
        if "japanese" in lang or lang == "ja" or "日本語" in lang:
            return "- です/ます調で丁寧かつ自然に、一〜二文。\n- 場面に合わせて軽い問いかけで始める（例：ご用件は？）。\n- 定型句の連発を避け、会話らしい流れに。"
        # Spanish
        if "spanish" in lang or lang == "es" or "español" in lang:
            you = "usted" if (is_formal or is_staff) else "tú"
            return f"- Registra {you} según el contexto.\n- Saludo breve y una pregunta sencilla para avanzar.\n- Sonido natural, evita plantillas genéricas."
        # French
        if "french" in lang or lang == "fr" or "français" in lang:
            you = "vous" if (is_formal or is_staff) else "tu"
            return f"- Utilise {you} selon le contexte.\n- Une ou deux phrases naturelles, avec une question simple.\n- Évite les tournures trop figées."
        # Chinese (generic)
        if "chinese" in lang or lang in {"zh", "中文", "汉语", "mandarin"}:
            return "- 自然礼貌，一两句即可。\n- 结合场景问一句简短问题带动交流。\n- 避免机械套话。"
        # Default
        return "- Keep it warm and human, 1–2 sentences.\n- Match the scenario, ask one light question.\n- Avoid stock phrases; sound conversational."

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

    async def generate_text(self, prompt: str, max_tokens: int = 2000, model: str | None = None) -> str:
        """Generate text response; use Responses API for gpt-5*, Chat Completions otherwise."""
        chosen_model = model or self.model
        use_responses_api = chosen_model.startswith("gpt-5")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            if use_responses_api:
                # Responses API expects 'input' and 'max_output_tokens'
                payload = {
                    "model": chosen_model,
                    "input": prompt,
                    "max_output_tokens": max_tokens,
                }
                # For GPT-5 family models, request lower reasoning effort for faster responses
                try:
                    payload["reasoning"] = {"effort": "low"}
                except Exception:
                    pass
                response = await client.post("/responses", json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                return self._extract_text(data)
            else:
                payload = {
                    "model": chosen_model,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": max_tokens,
                }
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()