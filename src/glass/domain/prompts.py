"""LLM prompt templates for Glass language learning assistant."""

from __future__ import annotations

from textwrap import dedent


# Maps human-friendly names/codes back to canonical ISO codes for lookups.
LANGUAGE_ALIASES = {
    "english": "en",
    "en": "en",
    "korean": "ko",
    "ko": "ko",
    "japanese": "ja",
    "ja": "ja",
    "chinese": "zh",
    "zh": "zh",
    "spanish": "es",
    "es": "es",
    "french": "fr",
    "fr": "fr",
}


# Pronunciation examples for language pairs (native -> target codes)
PRONUNCIATION_EXAMPLES = {
    # Chinese learners (zh)
    ("zh", "ko"): "Korean '안녕하세요' → 'ān níng hā sāi yō'",
    ("zh", "ja"): "Japanese 'ありがとう' → 'ā lǐ gā duō'",
    ("zh", "en"): "English 'hello' → 'hā lóu'",
    ("zh", "es"): "Spanish 'hola' → 'āo lā'",
    ("zh", "fr"): "French 'bonjour' → 'bāng zhū'",
    # Korean learners (ko)
    ("ko", "zh"): "Chinese '你好' → '니하오'",
    ("ko", "ja"): "Japanese 'ありがとう' → '아리가또'",
    ("ko", "en"): "English 'hello' → '헬로우'",
    ("ko", "es"): "Spanish 'gracias' → '그라씨아스'",
    ("ko", "fr"): "French 'merci' → '메르씨'",
    # Japanese learners (ja)
    ("ja", "zh"): "Chinese '你好' → 'ニーハオ'",
    ("ja", "ko"): "Korean '안녕하세요' → 'アンニョンハセヨ'",
    ("ja", "en"): "English 'thank you' → 'サンキュー'",
    ("ja", "es"): "Spanish 'hola' → 'オラ'",
    ("ja", "fr"): "French 'bonjour' → 'ボンジュール'",
    # English learners (en)
    ("en", "zh"): "Chinese '谢谢' → 'xie-xie'",
    ("en", "ko"): "Korean '감사합니다' → 'gam-sa-ham-ni-da'",
    ("en", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("en", "es"): "Spanish 'gracias' → 'gra-see-as'",
    ("en", "fr"): "French 'merci' → 'mer-see'",
    # Spanish learners (es)
    ("es", "zh"): "Chinese '你好' → 'ni jao'",
    ("es", "ko"): "Korean '안녕하세요' → 'an-niong-ja-se-io'",
    ("es", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("es", "en"): "English 'hello' → 'je-lou'",
    ("es", "fr"): "French 'bonjour' → 'bon-yur'",
    # French learners (fr)
    ("fr", "zh"): "Chinese '你好' → 'ni hao'",
    ("fr", "ko"): "Korean '안녕하세요' → 'an-nioung-ha-sé-yo'",
    ("fr", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("fr", "en"): "English 'hello' → 'hé-lo'",
    ("fr", "es"): "Spanish 'hola' → 'o-la'",
}

ROMANIZATION_EXAMPLES = {
    "ja": "'ありがとう' → 'arigatou'",
    "ko": "'안녕하세요' → 'annyeonghaseyo'",
    "zh": "'你好' → 'ni hao'",
    "en": "'hello' → 'hello'",
    "es": "'gracias' → 'gracias'",
    "fr": "'merci' → 'merci'",
}


def get_pronunciation_example(native_lang: str, target_lang: str) -> str:
    """Get pronunciation example for language pair."""
    native = LANGUAGE_ALIASES.get(native_lang.strip().lower(), native_lang.strip().lower())
    target = LANGUAGE_ALIASES.get(target_lang.strip().lower(), target_lang.strip().lower())
    return PRONUNCIATION_EXAMPLES.get(
        (native, target), f"Write sounds in your native script, like '{target}' → (phonetic)"
    )


def get_romanization_example(target_lang: str) -> str:
    """Get romanization example for target language."""
    target = LANGUAGE_ALIASES.get(target_lang.strip().lower(), target_lang.strip().lower())
    return ROMANIZATION_EXAMPLES.get(target, f"Romanize {target} text")


def build_suggestion_prompt(
    *,
    target_lang: str,
    native_lang: str,
    user_hint: str | None = None,
    recent_conversation: list[str] | None,
    profile_facts: list[dict[str, str]] | None = None,
    last_partner_message: str | None = None,
    length_mode: str = "auto",
) -> tuple[str, str]:
    """Build system and user prompts for conversation suggestions.

    Returns:
        (system_prompt, user_prompt)
    """
    # Determine length instruction based on mode
    length_instruction = ""
    if length_mode == "short":
        length_instruction = "\n6. **Length**: EXACTLY 1 sentence only. No more, no less."
    elif length_mode == "long":
        length_instruction = "\n6. **Length**: MUST provide EXACTLY 4 complete sentences. This is for extended practice. Count carefully and provide all 4 sentences."

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
5. **Context-aware**: Use provided context only when genuinely relevant. Profile facts are written in the user's native language—reuse the value verbatim when it helps.{length_instruction}

# Output Format
Return JSON with suggestion and translation:
- target_text: The suggested phrase in {target_lang}
- native_translation: Translation in {native_lang}"""

    # Build user prompt sections
    sections = []

    # Section 1: User hint (highest priority)
    if user_hint:
        sections.append(
            dedent(
                f"""
            # ⚠️ USER'S SPECIFIC REQUEST (HIGHEST PRIORITY)
            The user wants to say: "{user_hint}"
            
            **IMPORTANT**: Base your suggestion on this hint, even if it changes the topic.
            The user is explicitly asking for help with this specific expression or topic.
        """
            ).strip()
        )

    # Section 2: Recent conversation
    if recent_conversation:
        conversation_header = "# Recent Conversation (For Context)"
        if user_hint:
            conversation_header += "\n_Note: User wants to change topic/say something specific (see above)_"
        sections.append(conversation_header + "\n" + "\n".join(recent_conversation))

    # Section 3: Partner's latest message (for quick reference)
    if last_partner_message:
        sections.append("# Partner's Last Message\n" + last_partner_message)

    # Section 4: Stored profile facts (canonical user info)
    if profile_facts:
        fact_lines = []
        for fact in profile_facts:
            key = fact.get("key") or "fact"
            value = fact.get("value") or ""
            category = fact.get("category")
            updated = fact.get("updated_at")
            extra = []
            if category:
                extra.append(category)
            if updated:
                extra.append(f"updated {updated}")
            qualifier = f" ({', '.join(extra)})" if extra else ""
            fact_lines.append(f"- {key}: {value}{qualifier}")
        if fact_lines:
            sections.append(
                "# User Profile Facts (written in the learner's native language)\n"
                + "\n".join(fact_lines)
                + "\n\nUse them exactly as written when relevant."
            )

    # Section 4: Task instruction
    length_requirement = ""
    if length_mode == "short":
        length_requirement = "\n\n**CRITICAL LENGTH REQUIREMENT**: Provide EXACTLY 1 sentence. No more, no less."
    elif length_mode == "long":
        length_requirement = "\n\n**CRITICAL LENGTH REQUIREMENT**: Provide EXACTLY 4 complete sentences. Count them carefully. This is mandatory for extended practice."

    if user_hint:
        task = dedent(
            f"""
            # Your Task
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
            ```
        """
        ).strip()
    else:
        task = dedent(
            f"""
            # Your Task
            Suggest what the learner should say next in {target_lang}, following the conversation flow.{length_requirement}
            
            Return JSON format:
            ```json
            {{
              "target_text": "Suggested phrase in {target_lang}",
              "native_translation": "Translation in {native_lang}"
            }}
            ```
        """
        ).strip()

    sections.append(task)

    user_prompt = "\n\n".join(sections)
    return system_prompt, user_prompt


def build_profile_fact_prompt(
    *,
    user_message: str,
    native_language: str,
) -> tuple[str, str]:
    """Build prompts for extracting profile facts from a user utterance."""
    system_prompt = """You identify personal facts about a speaker.

Extract only facts that describe the person (job, location, family, hobbies, goals, background, preferences).
Return STRICT JSON: an array of objects with "key", "value", and "category".
If there are no relevant facts, return [].
"""
    user_prompt = dedent(
        f"""
        The user's native language is {native_language}. Keep the fact value EXACTLY in that language (no translation).

        Return JSON array only. Each object:
        - key: short English tag like job, location, family, hobby, goal, major, company
        - value: the fact in the user's own words (their native language)
        - category: one of profile, background, preference, goal (pick the closest)

        Example response:
        [
          {{"key": "job", "value": "저는 백엔드 엔지니어예요.", "category": "profile"}},
          {{"key": "location", "value": "도쿄에서 일하고 있어요.", "category": "background"}}
        ]

        Only extract facts about the user as a person. Ignore opinions or statements about others.

        User's message:
        \"\"\"{user_message}\"\"\"
        """
    ).strip()
    return system_prompt.strip(), user_prompt


def build_translation_prompt(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    """Build system and user prompts for translation.

    Returns:
        (system_prompt, user_prompt)
    """
    system = f"You are a translator. Output ONLY the translation in {target_lang}. No explanations."
    user = f"Translate from {source_lang} to {target_lang}. Preserve meaning, use natural phrasing:\n\n{text}"
    return system, user


def build_feedback_prompt(
    *,
    user_text: str,
    target_lang: str,
    native_lang: str,
    recent_conversation: list[str],
    last_suggestion: dict | None = None,
    thread_context: str | None = None,
) -> tuple[str, str]:
    """Build system and user prompts for feedback.

    Returns:
        (system_prompt, user_prompt)
    """
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
   - ALWAYS respond with JSON containing error type, explanation, and correction
   - Use error_type "none" when no correction is needed (leave other fields blank)

# Tone
Supportive but straightforward - focus on what's wrong, not what the user might have meant."""

    # Build user prompt sections
    sections = []

    # Section 1: User utterance
    sections.append(f'# User Utterance\n"{user_text}"')

    # Section 2: Recent suggestion context
    if last_suggestion:
        suggested_text = last_suggestion.get("target_text", "")
        suggested_translation = last_suggestion.get("native_translation", "")

        suggestion_info = f'# Recent Suggestion (Important Context)\nGlass suggested: "{suggested_text}"'
        if suggested_translation:
            suggestion_info += f'\nTranslation: "{suggested_translation}"'

        suggestion_info += dedent(
            """
            
            **Analysis Task**: Compare user's utterance with this suggestion.
            - If VERY SIMILAR sounds but different words → Pronunciation error
            - If COMPLETELY DIFFERENT → Intentional choice (evaluate what they said)
        """
        ).strip()
        sections.append(suggestion_info)

    # Section 3: Conversation context
    if recent_conversation or thread_context:
        context_parts = []
        if recent_conversation:
            context_parts.append("## Recent Conversation\n" + "\n".join(recent_conversation[-3:]))
        if thread_context:
            context_parts.append(f"## Session Patterns\n{thread_context}")
        sections.append("# Additional Context (Use if relevant)\n\n" + "\n\n".join(context_parts))

    # Section 4: Output format
    output_format = dedent(
        f"""
        # Output Format
        
        Always return JSON:
        ```json
        {{
          "error_type": "grammar | word_choice | pronunciation | politeness | fluency | none",
          "reason_native": "Direct error explanation in {native_lang}",
          "target_text": "Corrected version in {target_lang}"
        }}
        ```
        
        - Pick the most specific `error_type`. Use `"none"` ONLY when no correction is required.
        - When `error_type` is `"none"`, leave `reason_native` and `target_text` as empty strings.
        
        ## Examples of Good Feedback (Direct Tone)
        ✓ "'move'를 'new'로 잘못 발음했어요"
        ✓ "'my'가 빠졌어요. 'my favorite dish'라고 해야 해요"
        ✓ "'tank you'는 'thank you'로 발음해야 해요"
        
        ## Examples to Avoid (Don't Speculate)
        ✗ "'new'라고 말하고 싶었던 것 같습니다"
        ✗ "아마도 'my'를 말하려고 했던 것 같아요"
    """
    ).strip()
    sections.append(output_format)

    user_prompt = "\n\n".join(sections)
    return system_prompt, user_prompt


def build_feedback_gate_prompt(user_text: str, recent_conversation: list[str]) -> str:
    """Build prompt for feedback gating decision.

    Returns:
        Complete prompt (no system/user split for this simple task)
    """
    context = "\n".join(recent_conversation[-3:]) if recent_conversation else "(no context)"

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

    return prompt


def build_ai_response_prompt(
    *,
    user_text: str,
    partner_name: str | None = None,
    partner_description: str | None = None,
    target_lang: str,
    native_lang: str,
    recent_conversation: list[str],
    thread_context: str | None = None,
    interaction_context: str | None = None,
    user_name: str | None = None,
) -> tuple[str, str]:
    """Build system and user prompts for AI conversation partner response.

    Uses memory-based approach: learns about the user and partner over time.

    Returns:
        (system_prompt, user_prompt)
    """
    # Build character identity
    if partner_name:
        identity_parts = [f"You are {partner_name}"]
        if partner_description:
            identity_parts.append(f"({partner_description})")
        identity = ", ".join(identity_parts) + "."
    else:
        identity = "You are a friendly conversation partner."

    system_prompt = f"""{identity}

# Your Role
- Native {target_lang} speaker having a casual chat
- The current session summary tells you what's happened so far—build on it naturally
- Previous session summaries (if any) describe earlier interactions with this person
- If there's no history yet, treat this as a first meeting and learn about them

# Talk Style
- Keep it to 1-2 natural sentences unless the user clearly wants more
- Match their language level; be clear, warm, and encouraging
- Share personal details gradually, when it feels natural

# Key Principles
1. Respond to what they meant, not literal words
2. Build relationships slowly—ask, listen, then share
3. If names are unknown, ask politely instead of assuming
4. Stay in character without dumping your biography"""

    # Build user prompt sections
    sections = []

    if thread_context:
        context_summary = f"- User's name: {user_name}" if user_name else ""
        summary_block = "\n".join(filter(None, [context_summary, f"- Current session summary: {thread_context}"]))
        sections.append("# Current Session Context\n" + summary_block)
    else:
        intro_lines = ["# Current Session Context"]
        if user_name:
            intro_lines.append(f"- User's name: {user_name}")
        intro_lines.append("- No session history yet; start by getting to know them.")
        sections.append("\n".join(intro_lines))

    if interaction_context:
        sections.append("# Previous Interactions\n" + interaction_context)

    # Section 2: Conversation history
    if recent_conversation:
        sections.append("# Recent Conversation\n" + "\n".join(recent_conversation[-5:]))  # Last 5 messages

    # Section 5: Response instruction
    sections.append(
        f"# Your Task\nReply in {target_lang} with 1-2 natural sentences, building on the context above. Keep it conversational and let the relationship evolve over time."
    )

    user_prompt = "\n\n".join(sections)
    return system_prompt, user_prompt


def build_pronunciation_prompt(
    target_text: str,
    *,
    native_lang: str,
    target_lang: str,
    mode: str = "native",
) -> tuple[str, str]:
    """Build system and user prompts for pronunciation generation.

    Args:
        mode: 'romaji' for romanization, 'native' for native script pronunciation

    Returns:
        (system_prompt, user_prompt)
    """
    system = "Output ONLY a single line of pronunciation. No translation. No quotes. No prose."

    if mode == "romaji":
        example = get_romanization_example(target_lang)
        user = f"Romanize in ONE line.\nExample: {example}\n\n{target_lang} text: {target_text}"
    else:
        example = get_pronunciation_example(native_lang, target_lang)
        user = (
            f"Write sounds in {native_lang} script. ONE line.\nExample: {example}\n\n{target_lang} text: {target_text}"
        )

    return system, user


def build_analysis_scores_prompt(
    transcript: str,
    feedback_summary: str,
    learning_lang_name: str,
) -> str:
    """Build prompt for conversation scoring analysis.

    Returns:
        Complete prompt for analysis
    """
    return dedent(
        f"""
        You are evaluating a language learning conversation. The user is learning {learning_lang_name}.
        
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
        }}
    """
    ).strip()


def build_analysis_feedback_prompt(
    transcript: str,
    feedback_summary: str,
    learning_lang_name: str,
    native_lang_name: str,
) -> str:
    """Build prompt for conversation feedback analysis.

    Returns:
        Complete prompt for analysis
    """
    return dedent(
        f"""
        You are a language teacher providing feedback on a conversation. The student is learning {learning_lang_name} and their native language is {native_lang_name}.
        
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
        
        Write conversational feedback (plain text, not JSON):
    """
    ).strip()


def build_memory_extraction_prompt(
    conversation_excerpt: str,
    native_lang_name: str,
) -> tuple[str, str]:
    """Build prompts for extracting durable memories from a finished conversation."""
    system = dedent(
        f"""
        You are Glass Memory. Extract only durable, long-term facts explicitly stated in the conversation.

        USER FACTS (highest priority):
        Stable information about the user such as identity traits (not name), background, long-term preferences, routines, constraints, skills, or goals.

        INTERACTION FACTS:
        Long-term agreements, commitments, or follow-ups shared between the user and the partner that extend beyond this session.

        # Durable vs Non-durable
        Example (store): “I work night shifts.” (stable routine)
        Example (discard): “I’m tired today.” (temporary state)

        Do NOT store one-off events, emotions, greetings, or temporary plans.
        Do NOT infer or guess. Only use explicit statements.
        Prefer storing user facts over anything else.
        Write all insights in {native_lang_name}.
        """
    ).strip()
    user = dedent(
        f"""
        Conversation transcript:
        {conversation_excerpt}

        Return ONLY this JSON object:

        {{ "user_insights": [...], "interaction_insights": [...] }}

        Rules:
        - If a section has no durable facts, return an empty array.
        - User insights take priority over interaction facts.
        - Exclude all names and any personal identifiers.
        - Include only explicit, long-term facts.
        - Output ONLY the JSON object.
        """
    ).strip()
    return system, user


def build_thread_summary_prompt(
    conversation_lines: list[str],
    existing_summary: str | None = None,
) -> tuple[str, str]:
    """Summarize conversation into concise briefing bullets with accumulated context."""
    system = dedent(
        """
        You summarize conversations into short reminder bullets for an AI partner.
        Keep it factual, under 3 lines, and capture ongoing context.
        """
    ).strip()
    excerpt = "\n".join(conversation_lines[-10:]) if conversation_lines else "(no recent conversation yet)"

    previous = (
        f"Existing summary:\n{existing_summary.strip()}\n\n"
        if isinstance(existing_summary, str) and existing_summary.strip()
        else ""
    )
    user = dedent(
        f"""
        {previous}Conversation snippet:
        {excerpt}

        Write up to 3 short bullet lines covering:
        - What the user talked about or asked for
        - Any commitments, plans, or follow-ups mentioned
        - Optional tone/relationship cue if helpful
        """
    ).strip()
    return system, user
