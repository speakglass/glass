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
    memory_context: str | None = None,
    length_mode: str = "auto",
    partner_name: str | None = None,
    user_name: str | None = None,
) -> tuple[str, str]:
    """Build system and user prompts for conversation suggestions.

    Args:
        target_lang: Target language being learned
        native_lang: User's native language
        user_hint: Optional hint from user about what they want to say
        recent_conversation: Recent conversation messages
        last_partner_message: Last message from conversation partner
        memory_context: Relevant memories from semantic search (user/partner/interaction facts)
        length_mode: Suggestion length preference (auto/short/long)
        partner_name: Name of conversation partner
        user_name: Name of user

    Returns:
        Tuple of (system_prompt, user_prompt)
    """

    normalized_length_mode = (length_mode or "auto").lower()
    length_mode_rule = {
        "short": 'length_mode="short" (exactly 1 sentence).',
        "long": 'length_mode="long" (exactly 4 sentences).',
    }.get(normalized_length_mode, 'length_mode="auto" (any natural length is fine).')

    # Build conversation context if available
    context_parts = []
    if user_name:
        context_parts.append(f"You're coaching {user_name}")
    if partner_name:
        context_parts.append(f"talking with {partner_name}")

    conversation_context = ""
    if context_parts:
        conversation_context = "\n\n" + " ".join(context_parts) + "."

    hint_text = (user_hint or "").strip()

    # Build different prompts based on whether hint is provided
    if hint_text:
        # When hint exists: Focus ONLY on expanding the hint
        system_prompt = dedent(
            f"""
            Conversation coach for {target_lang} users (native: {native_lang}).{conversation_context}
            
            Task: Turn the user's hint into a complete, natural {target_lang} sentence.
            
            Rules:
            - Even if it's just a word/phrase, expand it into a FULL sentence
            - Keep the user's intended meaning exactly - don't change what they want to say
            - Use conversation context ONLY for tone/formality, NOT to override their intent
            - Use background information to personalize the suggestion when relevant
            
            CRITICAL: In your response, native_translation must be the translation of YOUR target_text suggestion (NOT the user's hint).
            
            Length: {length_mode_rule}
            """
        ).strip()

        sections = []

        # Add relevant memories FIRST (highest priority context)
        if memory_context:
            sections.append(
                f"Relevant facts (from past conversations):\n\n{memory_context}\n\n"
                "(Use these to personalize the suggestion when relevant.)"
            )

        sections.append(
            f"User's hint (in {native_lang}):\n{hint_text}\n\nExpand this into a complete {target_lang} sentence."
        )

        # Add minimal context only for style reference
        if recent_conversation:
            recent_lines = recent_conversation[-3:] if len(recent_conversation) > 3 else recent_conversation
            conversation_text = "\n".join(line.strip() for line in recent_lines if line and line.strip())
            if conversation_text:
                sections.append(f"Conversation style reference (for tone/formality only):\n{conversation_text}")

    else:
        # When no hint: Suggest based on conversation flow
        system_prompt = dedent(
            f"""
            Conversation coach for {target_lang} users (native: {native_lang}).{conversation_context}
            
            Your task: Suggest what the USER should say next in {target_lang}.
            
            Analyze the conversation flow and suggest a natural, appropriate response.
            Be culturally appropriate and match the conversation tone.
            Use background information to make suggestions more personal and relevant.
            
            Length: {length_mode_rule}
            """
        ).strip()

        sections = []

        # Add relevant memories FIRST (guides suggestion direction)
        if memory_context:
            sections.append(
                f"Relevant facts (from past conversations):\n\n{memory_context}\n\n"
                "(Use these to make your suggestion more relevant.)"
            )

        if recent_conversation:
            recent_lines = recent_conversation[-5:] if len(recent_conversation) > 5 else recent_conversation
            conversation_text = "\n".join(line.strip() for line in recent_lines if line and line.strip())
            if conversation_text:
                sections.append(f"Recent conversation:\n{conversation_text}")

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

    # Determine if this is the first message (conversation just starting)
    is_first_message = not conversation_summary and len(recent_conversation) <= 1

    # Build first message instruction
    if is_first_message:
        first_msg_parts = ["First message:"]
        if user_name:
            first_msg_parts.append(f"Greet {user_name}")
        else:
            first_msg_parts.append("Greet warmly")

        if relationship_context:
            first_msg_parts.append("reference a past memory")
        else:
            first_msg_parts.append("introduce yourself briefly")

        first_msg_parts.append("End with a question to start conversation.")
        first_message_instruction = " ".join(first_msg_parts)
    else:
        first_message_instruction = "Continue the conversation naturally."

    system_prompt = f"""{identity} Native {target_lang} speaker.

Respond ONLY in {target_lang}.

Keep replies warm and encouraging but use plain text only—no emojis, emoticons, or markdown styling.

Answer questions naturally:
- General knowledge → answer directly from what you know
- Personal questions → use memory search if needed

{first_message_instruction}

CRITICAL: Focus on THEIR topic. Don't force your background/interests into every reply unless directly relevant

Output: Just your conversational reply. No meta-commentary, no explanations about what type of question it is."""

    # Build user prompt - clearly separate past memories from current conversation
    sections = []

    # 1. User identification
    if user_name:
        sections.append(f"Speaking with: {user_name}")

    # 2. Past memories (from previous sessions) - if available
    if relationship_context:
        limited = relationship_context[:400] + "..." if len(relationship_context) > 400 else relationship_context
        sections.append(f"PAST MEMORIES (from previous conversations):\n{limited}")

    # 3. Current conversation (this session)
    current_conv_parts = []

    if conversation_summary:
        current_conv_parts.append(f"Earlier in this conversation:\n{conversation_summary.strip()}")

    if recent_conversation:
        current_conv_parts.append("Recent messages:\n" + "\n".join(recent_conversation))

    if current_conv_parts:
        sections.append("CURRENT CONVERSATION:\n" + "\n\n".join(current_conv_parts))
    elif not relationship_context:
        # First time meeting, no history at all
        sections.append("CURRENT CONVERSATION:\n(Starting new conversation)")

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
    system = "Output ONLY a single line of pronunciation. No translation. No quotes. No prose. No full sentences - ONLY the pronunciation guide."

    if mode == "romaji":
        example = get_romanization_example(target_lang)
        user = f"Romanize this {target_lang} text in ONE line.\nExample: {example}\n\nText to romanize: {target_text}"
    else:
        example = get_pronunciation_example(native_lang, target_lang)
        user = dedent(
            f"""
            Write ONLY the pronunciation of this {target_lang} text using {native_lang} script.
            
            Example: {example}
            
            {target_lang} text to pronounce: "{target_text}"
            
            Output: Write ONLY the pronunciation in {native_lang} script (ONE line, no translation, no explanation).
            """
        ).strip()

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
    user_name: str | None = None,
) -> str:
    """Build prompt for overall conversation feedback based on individual feedback items.

    Returns:
        Complete prompt for analysis
    """
    has_feedback = bool(feedback_summary and feedback_summary.strip())

    # Build learner identification
    learner_name = user_name if user_name else "The learner"

    if user_message_count == 0:
        context = f"{learner_name} didn't speak during this session."
    elif has_feedback:
        # When there are feedback items - focus on feedback only
        context = f"""Feedback items from the session:
{feedback_summary}"""
    else:
        # When no feedback
        context = f"No corrections needed - {learner_name}'s {learning_lang_name} was natural and clear."

    return dedent(
        f"""
        You are a language coach writing a post-session performance summary.
        
        Write in {native_lang_name}. Output 3-5 sentences.
        
        ### Session Data
        {context}
        
        ### Instructions
        Write a warm, encouraging summary of their {learning_lang_name} performance:
        - If feedback exists: highlight key patterns and suggest improvements
        - If no feedback: acknowledge their strong performance
        - Keep the tone light and conversational, like a supportive study buddy (avoid stiff formal phrasing)
        - Include a short encouragement about their ongoing practice or motivation
        - This is a summary report, NOT a chat message to them
        - Write plain text only, no formatting
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
