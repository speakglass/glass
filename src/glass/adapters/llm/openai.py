"""OpenAI LLM adapter with Zep memory tool integration."""

from __future__ import annotations

from typing import Any, Sequence
import json
import logging

import httpx

from ...domain.prompts import resolve_prompt

LOGGER = logging.getLogger(__name__)

# Zep Memory Search Tool Definition for OpenAI Function Calling
ZEP_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_user_facts",
        "description": "Search for relevant facts about the user from their conversation history. Use this to personalize responses, suggestions, and translations based on user's preferences, background, and past interactions.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant user facts (e.g., 'user preferences', 'user background', 'topics user discussed')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of facts to return (default: 5)",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    }
}


class OpenAILLMAdapter:
    """Adapter that calls OpenAI's Responses API for suggestions with Zep memory tool support."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gpt-4.1-mini",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 15.0,
        role: str = "progress",
        memory_adapter = None,  # Zep memory adapter for tool calls
    ) -> None:
        if not api_key:
            msg = "OpenAI API key is required."
            raise ValueError(msg)
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.role = role
        self.memory_adapter = memory_adapter  # For Zep tool calls
        self.user_id: str | None = None  # Set by LLMProcessor
        self._logger = logging.getLogger(__name__)

    async def _handle_tool_call(self, tool_name: str, tool_args: dict) -> str:
        """Handle OpenAI tool calls (currently only Zep search_user_facts).
        
        Args:
            tool_name: Name of the tool to call
            tool_args: Arguments for the tool
            
        Returns:
            JSON string with tool results
        """
        if tool_name == "search_user_facts":
            if not self.memory_adapter or not self.user_id:
                return json.dumps({"facts": [], "message": "Memory search not available"})
            
            try:
                query = tool_args.get("query", "")
                limit = tool_args.get("limit", 5)
                
                LOGGER.info(f"[Tool:search_user_facts] Searching for: {query} (limit={limit})")
                
                # Search Zep Knowledge Graph
                edges = await self.memory_adapter.client.graph.search(
                    user_id=self.user_id,
                    query=query,
                    scope="edges",
                    limit=limit,
                )
                
                # Format facts with temporal validity
                facts = []
                for edge in edges.edges:
                    if hasattr(edge, 'fact') and edge.fact:
                        valid_at = edge.valid_at if hasattr(edge, 'valid_at') and edge.valid_at else "date unknown"
                        invalid_at = edge.invalid_at if hasattr(edge, 'invalid_at') and edge.invalid_at else "present"
                        fact_text = f"{edge.fact} (Valid: {valid_at} - {invalid_at})"
                        facts.append(fact_text)
                
                LOGGER.info(f"[Tool:search_user_facts] Found {len(facts)} facts for query '{query}':")
                for i, fact in enumerate(facts, 1):
                    LOGGER.info(f"[Tool:search_user_facts]   {i}. {fact}")
                
                return json.dumps({
                    "facts": facts,
                    "count": len(facts),
                    "query": query
                })
            except Exception as e:
                LOGGER.error(f"[Tool:search_user_facts] Error: {e}", exc_info=True)
                return json.dumps({"facts": [], "error": str(e)})
        
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    async def _call_with_tools(
        self,
        messages: list[dict],
        model: str = "gpt-4.1-mini",
        temperature: float = 0.3,
        max_tokens: int = 1000,
        response_format: dict | None = None,
    ) -> dict:
        """Call OpenAI with tool support and handle tool calls loop.
        
        Args:
            messages: Chat messages
            model: Model to use
            temperature: Sampling temperature
            max_tokens: Max tokens in response
            response_format: Optional response format (e.g., {"type": "json_object"})
            
        Returns:
            Parsed JSON response from final LLM call
        """
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "tools": [ZEP_SEARCH_TOOL] if self.memory_adapter and self.user_id else None,
            "tool_choice": "auto",
        }
        
        if response_format:
            payload["response_format"] = response_format
        
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            # Initial call
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            message = data["choices"][0]["message"]
            
            # Check if LLM requested tool calls
            if tool_calls := message.get("tool_calls"):
                LOGGER.info(f"[Tools] LLM requested {len(tool_calls)} tool call(s)")
                
                # Execute each tool call
                tool_messages = [message]  # Add assistant's message with tool calls
                
                for tool_call in tool_calls:
                    func_name = tool_call["function"]["name"]
                    func_args = json.loads(tool_call["function"]["arguments"])
                    
                    # Call our handler
                    result = await self._handle_tool_call(func_name, func_args)
                    
                    tool_messages.append({
                        "tool_call_id": tool_call["id"],
                        "role": "tool",
                        "name": func_name,
                        "content": result,
                    })
                
                # Send tool results back to LLM
                final_payload = {
                    **payload,
                    "messages": messages + tool_messages,
                }
                # Remove tools from final payload
                final_payload.pop("tools", None)
                final_payload.pop("tool_choice", None)
                
                LOGGER.info("[Tools] Sending tool results back to LLM for final response")
                
                final_response = await client.post("/chat/completions", json=final_payload, headers=headers)
                final_response.raise_for_status()
                final_data = final_response.json()
                
                return final_data["choices"][0]["message"]["content"]
            
            # No tool calls - return direct response
            return message.get("content", "")

    async def suggest(
        self,
        *,
        recent_conversation: Sequence[dict],
        target_lang: str,
        native_lang: str,
        user_hint: str | None = None,
        user_context: str | None = None,
        thread_context: str | None = None,
        length_mode: str = "auto",
    ) -> dict | None:
        """Generate conversation suggestion with optional context and length control."""
        
        LOGGER.info(f"[Suggest] Received length_mode={length_mode}")
        
        # Determine length instruction based on mode
        length_instruction = ""
        if length_mode == "short":
            length_instruction = "\n6. **Length**: EXACTLY 1 sentence only. No more, no less."
            LOGGER.info("[Suggest] Using SHORT mode (1 sentence)")
        elif length_mode == "long":
            length_instruction = "\n6. **Length**: MUST provide EXACTLY 4 complete sentences. This is for extended practice. Count carefully and provide all 4 sentences."
            LOGGER.info("[Suggest] Using LONG mode (4 sentences)")
        else:
            LOGGER.info("[Suggest] Using AUTO mode (natural length)")
        # else: auto - no length instruction, let LLM decide naturally
        
        # System prompt: structured and direct (GPT-4.1 best practices)
        system_prompt = f"""You are a language learning assistant helping a learner practice {target_lang}.

# Your Task
Suggest a natural, contextually appropriate response in {target_lang} for the learner to say next.

# Suggestion Guidelines (Priority Order)
1. **User hint first**: If user provides specific hint/topic, PRIORITIZE it over conversation flow
   - User hint means they want to change topic or say something specific
   - Even if hint is unrelated to current conversation, follow the hint
2. **Flow-based**: If no hint, follow the natural conversation flow
3. **Level-appropriate**: Match the user's proficiency level
4. **Conversational**: Keep it natural and realistic
5. **Context-aware**: Use provided context only when genuinely relevant{length_instruction}

# Output Format
Return JSON with suggestion and translation:
- target_text: The suggested phrase in {target_lang}
- native_translation: Translation in {native_lang}"""

        # Build user prompt with clear structure (GPT-4.1 best practices)
        prompt_sections = []
        
        # Section 1: User hint (if provided) - HIGHEST PRIORITY
        if user_hint:
            hint_section = f"""# ⚠️ USER'S SPECIFIC REQUEST (HIGHEST PRIORITY)
The user wants to say: "{user_hint}"

**IMPORTANT**: Base your suggestion on this hint, even if it changes the topic.
The user is explicitly asking for help with this specific expression or topic."""
            prompt_sections.append(hint_section)
        
        # Section 2: Recent conversation (for context)
        if recent_conversation:
            conv_lines = [
                f"{msg.get('speaker', 'unknown')}: {msg.get('text', '')}"
                for msg in recent_conversation
            ]
            conversation_header = "# Recent Conversation (For Context)"
            if user_hint:
                conversation_header += "\n_Note: User wants to change topic/say something specific (see above)_"
            prompt_sections.append(conversation_header + "\n" + "\n".join(conv_lines))
        
        # Section 3: Optional contexts
        context_parts = []
        if user_context:
            context_parts.append(f"## User Background\n{user_context}")
        if thread_context:
            context_parts.append(f"## Session Info\n{thread_context}")
        
        if context_parts:
            prompt_sections.append("# Additional Context (Use if Relevant)\n" + "\n\n".join(context_parts))
        
        # Section 4: Task instruction with length requirement
        length_requirement = ""
        if length_mode == "short":
            length_requirement = "\n\n**CRITICAL LENGTH REQUIREMENT**: Provide EXACTLY 1 sentence. No more, no less."
        elif length_mode == "long":
            length_requirement = "\n\n**CRITICAL LENGTH REQUIREMENT**: Provide EXACTLY 4 complete sentences. Count them carefully. This is mandatory for extended practice."
        
        if user_hint:
            task_instruction = f"""# Your Task
Create a suggestion based on the user's request: "{user_hint}"

The suggestion should:
1. Match what the user wants to say (their hint)
2. Be in natural {target_lang}
3. Appropriate for the context (topic change is OK){length_requirement}

Return JSON format:
```json
{{
  "target_text": "Suggested phrase in {target_lang} based on user's hint",
  "native_translation": "Translation in {native_lang}"
}}
```"""
        else:
            task_instruction = f"""# Your Task
Suggest what the learner should say next in {target_lang}, following the conversation flow.{length_requirement}

Return JSON format:
```json
{{
  "target_text": "Suggested phrase in {target_lang}",
  "native_translation": "Translation in {native_lang}"
}}
```"""
        prompt_sections.append(task_instruction)
        
        user_prompt = "\n\n".join(prompt_sections)
        
        # Call OpenAI with chat/completions
        try:
            response_text = await self._call_chat(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model="gpt-4o-mini",
                temperature=0.7,
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response_text)
            return result
        except Exception as e:
            LOGGER.error(f"Suggestion failed: {e}", exc_info=True)
            return None

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
        system = f"You are a translator. Output ONLY the translation in {target_lang}. No explanations."
        user = f"Translate from {source_lang} to {target_lang}. Preserve meaning, use natural phrasing:\n\n{text}"
        
        payload = {
            "model": "gpt-4.1-mini",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
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
        system = "Output ONLY a single line of pronunciation. No translation. No quotes. No prose."
        if (mode or "").strip().lower() == "romaji":
            example = self._get_romanization_example(target)
            user = f"Romanize in ONE line.\nExample: {example}\n\n{target} text: {text}"
        else:
            example = self._get_pronunciation_example(native, target)
            user = f"Write sounds in {native} script. ONE line.\nExample: {example}\n\n{target} text: {text}"
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
    
    async def _call_chat(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        response_format: dict | None = None,
    ) -> str:
        """Unified method for calling OpenAI chat/completions."""
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        if response_format:
            payload["response_format"] = response_format
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
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
        recent_conversation: Sequence[dict] | None = None,
        user_context: str | None = None,
        thread_context: str | None = None,
        last_suggestion: dict | None = None,
    ) -> str:
        """Generate feedback with optional context and suggestion comparison.
        
        Args:
            last_suggestion: Most recent suggestion (if user tried to follow it).
                            Used to detect pronunciation issues vs intentional changes.
        """
        
        if not target_lang:
            target_lang = "English"
        if not native_lang:
            native_lang = "Korean"
        
        # System prompt: direct and structured (GPT-4.1 best practices)
        system_prompt = f"""You are a language teacher evaluating a learner's {target_lang} utterance.

# Your Task
Provide direct, actionable feedback in {native_lang} when corrections are needed.

# Evaluation Criteria
Assess these aspects:
- Grammar and syntax
- Vocabulary choice and usage
- Pronunciation (sound-alike errors)
- Natural expression

# Feedback Rules
1. **Be direct**: State the error clearly, don't speculate about intent
   - Good: "'move' is mispronounced as 'new'"
   - Bad: "You might have wanted to say 'new'"

2. **Distinguish error types**:
   - Pronunciation error: User attempted suggested phrase but mispronounced (e.g., "tank you" → "thank you")
   - Intentional choice: User said something completely different (evaluate what they said)

3. **Output format**:
   - If correction needed: Return JSON with error explanation and corrected version
   - If no correction needed: Return "NONE"

# Tone
Supportive but straightforward - focus on what's wrong, not what the user might have meant."""

        # Build user prompt with clear structure (GPT-4.1 best practices)
        prompt_sections = []
        
        # Section 1: User utterance
        prompt_sections.append(f"# User Utterance\n\"{user_text}\"")
        
        # Section 2: Recent suggestion context (if available)
        if last_suggestion:
            suggested_text = last_suggestion.get("target_text", "")
            suggested_translation = last_suggestion.get("native_translation", "")
            
            suggestion_info = f"# Recent Suggestion (Important Context)\nGlass suggested: \"{suggested_text}\""
            if suggested_translation:
                suggestion_info += f"\nTranslation: \"{suggested_translation}\""
            
            suggestion_info += (
                "\n\n**Analysis Task**: Compare user's utterance with this suggestion."
                "\n- If VERY SIMILAR sounds but different words → Pronunciation error"
                "\n- If COMPLETELY DIFFERENT → Intentional choice (evaluate what they said)"
            )
            prompt_sections.append(suggestion_info)
        
        # Section 3: Conversation context (if helpful)
        context_parts = []
        if recent_conversation:
            conv_lines = [
                f"{msg.get('speaker', 'unknown')}: {msg.get('text', '')}"
                for msg in recent_conversation[-3:]
            ]
            context_parts.append("## Recent Conversation\n" + "\n".join(conv_lines))
        
        if thread_context:
            context_parts.append(f"## Session Patterns\n{thread_context}")
        
        if context_parts:
            prompt_sections.append("# Additional Context (Use if relevant)\n" + "\n\n".join(context_parts))
        
        # Section 4: Output instructions
        output_format = f"""# Output Format

Return JSON if correction needed:
```json
{{
  "reason_native": "Direct error explanation in {native_lang}",
  "suggestion_target": "Corrected version in {target_lang}"
}}
```

Or return: NONE (if no correction needed)

## Examples of Good Feedback (Direct Tone)
✓ "'move'를 'new'로 잘못 발음했어요"
✓ "'my'가 빠졌어요. 'my favorite dish'라고 해야 해요"
✓ "'tank you'는 'thank you'로 발음해야 해요"

## Examples to Avoid (Don't Speculate)
✗ "'new'라고 말하고 싶었던 것 같습니다"
✗ "아마도 'my'를 말하려고 했던 것 같아요"
"""
        prompt_sections.append(output_format)
        
        user_prompt = "\n\n".join(prompt_sections)
        
        try:
            response = await self._call_chat(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model="gpt-4o-mini",
                temperature=0.3,
            )
            return response.strip()
        except Exception as e:
            LOGGER.error(f"Feedback failed: {e}", exc_info=True)
            return "NONE"

    async def should_feedback(
        self,
        recent_conversation: Sequence[dict],
        user_text: str,
        mode: str = "real",
    ) -> bool:
        """Lightweight gate to decide if feedback is needed."""
        
        # Format recent conversation
        conv_lines = [
            f"{msg.get('speaker', 'unknown')}: {msg.get('text', '')}"
            for msg in recent_conversation[-3:]
        ]
        context = "\n".join(conv_lines) if conv_lines else "(no context)"
        
        prompt = f"""You are a language coach. Decide if this needs feedback.

Give feedback when:
- Grammar/conjugation is clearly wrong
- Phrasing blocks understanding
- Pronunciation/clarity issues

Ignore:
- Punctuation, casing, filler words, minor STT glitches

Context:
{context}

Utterance: "{user_text}"

Return ONLY: YES or NO"""
        
        if mode == "practice":
            prompt = "[Practice Mode]\n" + prompt
        
        try:
            response = await self._call_chat(
                system_prompt="",
                user_prompt=prompt,
                model="gpt-4o-mini",
                temperature=0.1,
                max_tokens=10,
            )
            decision = response.strip().upper()
            return "YES" in decision
        except Exception as e:
            LOGGER.warning(f"should_feedback failed: {e}")
            # Fallback: allow feedback for longer utterances
            return len(user_text.split()) >= 4

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
        *,
        recent_conversation: Sequence[dict],
        target_lang: str,
        native_lang: str,
        user_context: str | None = None,
        thread_context: str | None = None,
        recent_feedback: Sequence[dict] | None = None,
    ) -> str:
        """Generate AI response in practice mode with optional context and Glass feedback."""
        
        # System prompt: structured for conversation partner role (GPT-4.1 best practices)
        system_prompt = f"""You are a native {target_lang} speaker having a conversation with a language learner.

# Your Role
Conversation partner in this scenario: {scenario or 'casual conversation'}

# Response Guidelines
1. **Natural conversation**: Respond in fluent, natural {target_lang}
2. **Match level**: Adapt to the user's proficiency (simple if beginner, complex if advanced)
3. **Brevity**: Keep responses conversational (2-3 sentences)
4. **Context awareness**: Use provided context only if it enhances naturalness

# Glass Feedback Integration (Critical)
- Glass (AI tutor) provides corrections in {native_lang}
- Use Glass feedback to understand what the user INTENDED to say
- When user makes pronunciation/grammar errors, naturally incorporate the correct form
- **Never mention Glass or corrections explicitly** - just respond naturally to their intent

## Example Flow
User says: "tzu tzu" (mispronounced "sushi")
Glass correction: "sushi를 말하려고 한 것 같아요"
Your response: "Oh, sushi! That sounds delicious. Do you like salmon or tuna?"

# Key Principle
Respond to what they MEANT, not what they literally said. Help them learn through natural conversation."""

        # Build user prompt with clear structure (GPT-4.1 best practices)
        prompt_sections = []
        
        # Section 1: Conversation history
        if recent_conversation:
            conv_lines = [
                f"{msg.get('speaker', 'unknown')}: {msg.get('text', '')}"
                for msg in recent_conversation
            ]
            prompt_sections.append("# Conversation History\n" + "\n".join(conv_lines))
        
        # Section 2: Glass feedback (critical for understanding intent)
        if recent_feedback:
            feedback_lines = []
            for fb in recent_feedback:
                # Extract correction if available
                if fb.get('suggestion') and fb['suggestion'].get('target_text'):
                    correction = fb['suggestion']['target_text']
                    feedback_lines.append(f"→ Correction: {correction}")
                elif fb.get('text'):
                    feedback_lines.append(f"→ {fb['text']}")
            
            if feedback_lines:
                feedback_section = (
                    "# Glass Feedback (User's Intent)\n"
                    "_Use this to understand what user meant. Don't mention it directly._\n\n" +
                    "\n".join(feedback_lines[-2:])
                )
                prompt_sections.append(feedback_section)
        
        # Section 3: Additional context (optional)
        context_parts = []
        if user_context:
            context_parts.append(f"## About User\n{user_context}")
        if thread_context:
            context_parts.append(f"## Session Info\n{thread_context}")
        
        if context_parts:
            prompt_sections.append("# Context (Use if Natural)\n" + "\n\n".join(context_parts))
        
        # Section 4: Current user input
        prompt_sections.append(f"# User's Latest Message\n\"{user_text}\"")
        
        # Section 5: Response instruction
        prompt_sections.append(f"# Your Task\nRespond naturally in {target_lang} as a conversation partner (2-3 sentences).")
        
        user_prompt = "\n\n".join(prompt_sections)
        
        try:
            response = await self._call_chat(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model="gpt-4o",  # Better for conversation
                temperature=0.8,  # More natural
                max_tokens=150,
            )
            return response.strip()
        except Exception as e:
            LOGGER.error(f"AI response failed: {e}", exc_info=True)
            return ""
    
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