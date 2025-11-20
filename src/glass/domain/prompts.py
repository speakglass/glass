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
    "spanish": "es",
    "es": "es",
    "french": "fr",
    "fr": "fr",
}


# Pronunciation examples for language pairs (native -> target codes)
PRONUNCIATION_EXAMPLES = {
    # Korean learners (ko)
    ("ko", "ja"): "Japanese 'ありがとう' → '아리가또'",
    ("ko", "en"): "English 'hello' → '헬로우'",
    ("ko", "es"): "Spanish 'gracias' → '그라씨아스'",
    ("ko", "fr"): "French 'merci' → '메르씨'",
    # Japanese learners (ja)
    ("ja", "ko"): "Korean '안녕하세요' → 'アンニョンハセヨ'",
    ("ja", "en"): "English 'thank you' → 'サンキュー'",
    ("ja", "es"): "Spanish 'hola' → 'オラ'",
    ("ja", "fr"): "French 'bonjour' → 'ボンジュール'",
    # English learners (en)
    ("en", "ko"): "Korean '감사합니다' → 'gam-sa-ham-ni-da'",
    ("en", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("en", "es"): "Spanish 'gracias' → 'gra-see-as'",
    ("en", "fr"): "French 'merci' → 'mer-see'",
    # Spanish learners (es)
    ("es", "ko"): "Korean '안녕하세요' → 'an-niong-ja-se-io'",
    ("es", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("es", "en"): "English 'hello' → 'je-lou'",
    ("es", "fr"): "French 'bonjour' → 'bon-yur'",
    # French learners (fr)
    ("fr", "ko"): "Korean '안녕하세요' → 'an-nioung-ha-sé-yo'",
    ("fr", "ja"): "Japanese 'ありがとう' → 'a-ri-ga-to'",
    ("fr", "en"): "English 'hello' → 'hé-lo'",
    ("fr", "es"): "Spanish 'hola' → 'o-la'",
}

ROMANIZATION_EXAMPLES = {
    "ja": "'ありがとう' → 'arigatou'",
    "ko": "'안녕하세요' → 'annyeonghaseyo'",
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
    last_partner_message: str | None = None,
    length_mode: str = "auto",
) -> tuple[str, str]:
    """Build system and user prompts for conversation suggestions."""

    normalized_length_mode = (length_mode or "auto").lower()
    length_mode_rule = {
        "short": 'length_mode="short" (exactly 1 sentence).',
        "long": 'length_mode="long" (exactly 4 sentences).',
    }.get(normalized_length_mode, 'length_mode="auto" (any natural length is fine).')

    system_prompt = dedent(
        f"""
        Conversation coach for {target_lang} users (native: {native_lang}).
        
        Your task: Suggest what the USER should say next in {target_lang}.
        DO NOT suggest what the partner should say - only suggest the user's response.

        Behavior:
        - Expand hints into full natural sentences for the user to say
        - Follow conversation flow - suggest the user's natural reply
        - Be culturally appropriate

        Priority: hint > flow > naturalness

        Length: {length_mode_rule}
        """
    ).strip()

    sections = []

    # User hint (if provided)
    hint_text = (user_hint or "").strip()
    if hint_text:
        sections.append(f"Hint: {hint_text}")

    # Recent conversation
    if recent_conversation:
        recent_lines = recent_conversation[-5:] if len(recent_conversation) > 5 else recent_conversation
        conversation_text = "\n".join(line.strip() for line in recent_lines if line and line.strip())
        if conversation_text:
            sections.append(f"Recent:\n{conversation_text}")

    user_prompt = "\n\n".join(sections) if sections else "Start the conversation."

    return system_prompt, user_prompt


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
) -> tuple[str, str]:
    """Build system and user prompts for feedback.

    Args:
        user_text: User's utterance to evaluate
        target_lang: Language being learned
        native_lang: User's native language
        recent_conversation: Recent conversation messages for context
        last_suggestion: Previous suggestion for comparison

    Returns:
        (system_prompt, user_prompt)
    """
    system_prompt = f"""Language teacher evaluating {target_lang} learner utterances.
Learner's native language: {native_lang}.

Task: Provide direct feedback when needed.

Evaluate: grammar, vocabulary, pronunciation, natural expression.

Rules:
1. Be direct: state errors clearly, don't speculate
2. Distinguish: pronunciation error vs intentional choice
3. Use error_type="none" when no correction needed

Tone: Supportive, straightforward."""

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

    # Section 3: Context (only if relevant)
    if recent_conversation:
        sections.append("# Recent Messages\n" + "\n".join(recent_conversation[-4:]))

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
    conversation_summary: str = "",
    relationship_context: str = "",
    user_name: str | None = None,
) -> tuple[str, str]:
    """Build system and user prompts for AI conversation partner response.

    Args:
        user_text: User's current message (for reference, not used in current implementation)
        partner_name: AI partner's name
        partner_description: AI partner's description/personality
        target_lang: Language being learned
        native_lang: User's native language (for reference, not used in current implementation)
        recent_conversation: Last N formatted conversation messages
        conversation_summary: Summary of conversation before the recent messages
        relationship_context: Prior relationship memories with this partner
        user_name: User's name (for reference, not used in current implementation)

    Returns:
        (system_prompt, user_prompt)
    """
    # Build character identity
    if partner_name:
        if partner_description:
            identity = f"You are {partner_name}, {partner_description}."
        else:
            identity = f"You are {partner_name}."
    else:
        identity = "You are a friendly conversation partner."

    system_prompt = f"""{identity}

Native {target_lang} speaker having a natural conversation.

Priority:
1. Answer what they're asking directly
2. Follow the conversation flow naturally
3. Keep replies short (1-2 sentences)

Important:
- Your character is background context only - don't force it into every response
- When referring to "previous conversations" memories, make it clear they're from past interactions (e.g., "Last time we chatted...", "I remember we talked about...")
- Focus on the CURRENT conversation primarily"""

    # Build user prompt - prioritize recent conversation flow
    sections = []

    # 1. Recent messages (MOST IMPORTANT - this is the CURRENT conversation)
    if recent_conversation:
        sections.append("CURRENT conversation (respond to this):\n" + "\n".join(recent_conversation))

    # 2. Background context (if available, keep brief)
    background_parts = []

    # Add user name if available
    if user_name:
        background_parts.append(f"Speaking with: {user_name}")

    # Add conversation summary (current session context before recent messages)
    if conversation_summary:
        background_parts.append(f"Earlier in this session:\n{conversation_summary.strip()}")

    # Add relationship context (memories from PREVIOUS conversations)
    if relationship_context:
        limited = relationship_context[:400] + "..." if len(relationship_context) > 400 else relationship_context
        background_parts.append(f"From previous conversations:\n{limited}")

    if background_parts:
        sections.append("Background context (for reference only):\n" + "\n".join(background_parts))

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
    feedback_summary: str,
    learning_lang_name: str,
) -> str:
    """Build prompt for conversation scoring based on feedback items.

    Returns:
        Complete prompt for analysis
    """
    return dedent(
        f"""
        Score a {learning_lang_name} practice session (0-100 scale).
        
        Feedback items:
        {feedback_summary or 'None'}
        
        Score for:
        - fluency: Flow and ease
        - accuracy: Grammar and vocabulary
        - comprehensibility: Clarity
        
        Scale:
        90-100: Excellent (no/few minor errors)
        75-89: Good (few errors, mostly clear)
        60-74: Fair (several errors, still understandable)
        40-59: Needs work (frequent errors)
        0-39: Poor (severe communication issues)
        
        Logic: More errors = lower scores. Grammar errors hurt accuracy. Pronunciation hurts comprehensibility. No feedback = 85-95. No user utterances = 0.
    """
    ).strip()


def build_analysis_feedback_prompt(
    feedback_summary: str,
    learning_lang_name: str,
    native_lang_name: str,
    conversation_summary: str = "",
    user_message_count: int = 0,
) -> str:
    """Build prompt for overall conversation feedback based on individual feedback items.

    Returns:
        Complete prompt for analysis
    """
    has_feedback = bool(feedback_summary and feedback_summary.strip())

    if user_message_count == 0:
        context = "You didn't speak during this session."
    elif has_feedback:
        # When there are feedback items
        context = f"""What you talked about:
{conversation_summary or 'General conversation'}

You sent {user_message_count} messages.

Feedback items (up to 20 most important):
{feedback_summary}"""
    else:
        # When no feedback - just conversation summary
        if user_message_count < 3:
            context = f"""You only sent {user_message_count} message{'s' if user_message_count > 1 else ''}.

What you talked about:
{conversation_summary or 'Brief exchange'}

No corrections needed - great job!"""
        else:
            context = f"""You sent {user_message_count} messages - great participation!

What you talked about:
{conversation_summary or 'Active conversation'}

No corrections needed - your {learning_lang_name} was natural and clear!"""

    return dedent(
        f"""
        Write super friendly feedback for a {learning_lang_name} learner.
        
        CRITICAL: Write your ENTIRE response in {native_lang_name}.
        
        {context}
        
        Task: Write 3-5 warm, encouraging sentences like talking to a friend:
        - Use casual, friendly tone (you're their supportive language buddy!)
        - Reference what they talked about to make it personal
        - If feedback exists: gently highlight patterns, suggest improvements warmly
        - If no feedback: celebrate their natural communication and fluency
        - If they barely spoke: encourage them to participate more next time
        - Write directly without headings or markdown formatting
        
        Remember: Be SUPER friendly and write EVERYTHING in {native_lang_name}!
    """
    ).strip()


def build_delayed_feedback_prompt(
    *,
    user_utterances: str,
    learning_lang_name: str,
    native_lang_name: str,
    max_items: int = 3,
) -> str:
    """Build prompt for post-session feedback when real-time feedback was disabled.

    Returns structured feedback using DelayedFeedbackResponse schema.
    """
    formatted = user_utterances.strip() or "(no learner utterances)"
    return dedent(
        f"""
        Language teacher reviewing {learning_lang_name} learner utterances.
        Learner's native language: {native_lang_name}.

        Utterances:
        {formatted}

        Task: Identify up to {max_items} utterances that need correction.

        Evaluate: grammar, vocabulary, pronunciation, natural expression.

        Rules:
        1. Be direct: state errors clearly, don't speculate
        2. Focus on important errors worth correcting
        3. Use error_type="none" only if utterance is already correct
        4. Explain errors in {native_lang_name}
        5. Provide corrected version in {learning_lang_name}

        Return structured feedback for each utterance that needs improvement.
    """
    ).strip()


def build_conversation_summary_prompt(
    conversation_lines: list[str],
    existing_summary: str | None = None,
) -> tuple[str, str]:
    """Summarize conversation into concise briefing bullets with accumulated context."""
    system = dedent(
        """
        You maintain a cumulative conversation summary for an AI partner.
        
        Task: Merge existing summary with new conversation into a concise, comprehensive summary.
        - Keep it under 3-4 bullet points
        - Preserve important context from existing summary
        - Add new relevant information from recent conversation
        - Remove outdated or superseded information
        - Stay factual and brief
        
        Output format: Write ONLY the bullet points with no headers, introductions, or extra text.
        Start directly with "* " or "- " for each point.
        """
    ).strip()

    # Limit to last 10 messages for efficiency
    excerpt = "\n".join(conversation_lines[-10:]) if conversation_lines else "(no recent conversation yet)"

    # Limit existing summary to prevent prompt bloat
    if isinstance(existing_summary, str) and existing_summary.strip():
        limited_summary = existing_summary[:500] + "..." if len(existing_summary) > 500 else existing_summary
        user = dedent(
            f"""
            Previous Summary:
            {limited_summary.strip()}
            
            New Conversation:
            {excerpt}
            
            Write updated summary as bullet points only (3-4 bullets):
            - Merge previous context with new information
            - Keep key facts, plans, commitments
            - Add new topics or relationship dynamics
            
            Output ONLY bullets starting with "* " or "- ". No headers or extra text.
            """
        ).strip()
    else:
        # First summary - no existing context
        user = dedent(
            f"""
            Conversation:
            {excerpt}
            
            Write summary as bullet points only (3-4 bullets):
            - What has been discussed
            - Any plans or commitments
            - Tone/relationship dynamics if relevant
            
            Output ONLY bullets starting with "* " or "- ". No headers or extra text.
            """
        ).strip()

    return system, user
