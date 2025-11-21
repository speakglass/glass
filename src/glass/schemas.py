"""Pydantic schemas for HTTP and WebSocket payloads."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ConversationAnalysisRequest(BaseModel):
    session_id: str = Field(..., description="Session identifier for the conversation to analyze.")


class ConversationScores(BaseModel):
    """Conversation quality scores for language users.

    Provides numerical scores (0-100) evaluating the user's performance.
    """

    fluency: float = Field(
        ...,
        ge=0,
        le=100,
        description="Fluency score (0-100): How smoothly and naturally the user spoke, without hesitation or awkward pauses",
    )
    accuracy: float = Field(
        ..., ge=0, le=100, description="Accuracy score (0-100): Grammar, vocabulary, and pronunciation correctness"
    )
    comprehensibility: float = Field(
        ...,
        ge=0,
        le=100,
        description="Comprehensibility score (0-100): How easy it was to understand what the user said",
    )


class ConversationAnalysisResponse(BaseModel):
    session_id: str
    scores: ConversationScores
    initial_memories: list[dict[str, Any]] = Field(
        default_factory=list, description="Seed memories captured alongside the analysis."
    )
    feedback: str = Field(..., description="Overall feedback with strengths and areas for improvement.")
    messages: list[dict] = Field(default_factory=list, description="All messages from the conversation.")
    feedback_items: list[dict] = Field(default_factory=list, description="All feedback items from the conversation.")


# ============================================================================
# LLM Response Schemas
# ============================================================================


class SuggestionResponse(BaseModel):
    """Response schema for conversation suggestions.

    Provides a natural sentence suggestion for what the USER should say next.
    """

    target_text: str = Field(
        ...,
        description="Complete natural sentence in {TARGET} that the USER should say next. NOT what the partner should say.",
    )
    native_translation: str = Field(
        ...,
        description="Translation of YOUR suggested target_text (not the user's hint) into {NATIVE}. ALWAYS translate the target_text you just generated.",
    )


class FeedbackResponse(BaseModel):
    """Response schema for user feedback.

    Provides error analysis and corrections for language user utterances.
    """

    error_type: Literal["grammar", "word_choice", "pronunciation", "politeness", "fluency", "none"] = Field(
        ..., description="Type of error detected in the utterance. Use 'none' if no correction is needed."
    )
    reason_native: str = Field(
        default="",
        description="Explanation of the error in {NATIVE} (the user's native language). Leave empty if error_type is 'none'.",
    )
    target_text: str = Field(
        default="",
        description="Corrected sentence in {TARGET} (the language being learned). Leave empty if error_type is 'none'.",
    )


class DelayedFeedbackItem(BaseModel):
    """Individual feedback item for delayed feedback."""

    utterance_number: int = Field(..., description="The utterance number (1-indexed)")
    original_text: str = Field(..., description="The original utterance text")
    error_type: Literal["grammar", "word_choice", "pronunciation", "politeness", "fluency", "none"] = Field(
        ..., description="Type of error detected. Use 'none' if no correction needed."
    )
    reason_native: str = Field(
        default="",
        description="Explanation of the error in {NATIVE}. Leave empty if error_type is 'none'.",
    )
    target_text: str = Field(
        default="",
        description="Corrected sentence in {TARGET}. Leave empty if error_type is 'none'.",
    )


class DelayedFeedbackResponse(BaseModel):
    """Response schema for delayed post-session feedback."""

    items: list[DelayedFeedbackItem] = Field(
        ..., description="List of feedback items for utterances that need correction"
    )


class MemoryExtractionFact(BaseModel):
    """A single extracted memory fact from conversation.

    Captures important information about the user, partner, or their interaction.
    """

    text: str = Field(
        ...,
        description="Concise factual statement in {NATIVE} (the user's native language) - clear, actionable information",
    )
    scope: Literal["user", "partner", "interaction"] = Field(
        ...,
        description="Scope: 'user' (about the user), 'partner' (about conversation partner), 'interaction' (about their relationship)",
    )
    speaker: Literal["user", "partner"] = Field(..., description="Who provided this information: 'user' or 'partner'")
    evidence: str = Field(default="", description="Brief quote from conversation supporting this fact")


class MemoryExtractionResponse(BaseModel):
    """Response schema for memory extraction from conversations.

    Extracts important facts worth remembering for future interactions.
    """

    facts: list[MemoryExtractionFact] = Field(
        default_factory=list,
        description="List of extracted memory facts from the conversation. Only include significant, useful information.",
    )


class MemoryClassificationResponse(BaseModel):
    """Response schema for memory classification.

    Analyzes and categorizes memory for optimal storage and retrieval.
    """

    category: Literal["fact", "preference", "skill", "context", "rule"] = Field(
        ...,
        description="Memory type: 'fact' (objective info), 'preference' (likes/dislikes), 'skill' (abilities), 'context' (situational), 'rule' (constraints)",
    )
    retention: Literal["short_term", "long_term", "permanent"] = Field(
        ..., description="How long to retain: 'short_term' (days), 'long_term' (months), 'permanent' (indefinite)"
    )
    importance: int = Field(
        ...,
        ge=0,
        le=100,
        description=(
            "Importance score (0-100): how critical this memory is for future conversations. "
            "80-100: Core identity/preferences (name, job, values). "
            "50-79: Significant facts (hobbies, relationships, goals). "
            "20-49: Contextual info (recent events, opinions). "
            "0-19: Minor details (casual mentions)."
        ),
    )
    summary: str = Field(
        default="", description="Brief headline summarizing the memory in {NATIVE} (the user's native language)"
    )
    expires_in_days: float | None = Field(
        None, description="Days until expiration (for short_term memories only, null otherwise)"
    )
