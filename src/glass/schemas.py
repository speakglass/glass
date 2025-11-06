"""Pydantic schemas for HTTP and WebSocket payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    session_id: str | None = Field(default=None, description="Existing session identifier.")
    text: str = Field(..., description="User prompt text.")
    screen_context: str | None = Field(default=None, description="Current screen summary.")
    language: str | None = Field(default=None, description="Preferred language code.")
    tone: str | None = Field(default=None, description="Suggestion tone override.")


class AskResponse(BaseModel):
    session_id: str
    answer: str
    suggestions: list[str]
    notes: list[str]


class ImageUploadResponse(BaseModel):
    session_id: str
    blob_id: str


class ConversationAnalysisRequest(BaseModel):
    session_id: str = Field(..., description="Session identifier for the conversation to analyze.")


class ExtractedInfo(BaseModel):
    label: str = Field(..., description="Label for the extracted information (e.g., 'User name', 'Interest').")
    value: str = Field(..., description="The extracted value.")
    editable: bool = Field(default=True, description="Whether this info can be edited by the user.")


class ConversationScores(BaseModel):
    fluency: float = Field(..., ge=0, le=100, description="Fluency score (0-100).")
    accuracy: float = Field(..., ge=0, le=100, description="Accuracy score (0-100).")
    comprehensibility: float = Field(..., ge=0, le=100, description="Comprehensibility score (0-100).")


class ConversationAnalysisResponse(BaseModel):
    session_id: str
    scores: ConversationScores
    extracted_info: list[ExtractedInfo]
    feedback: str = Field(..., description="Overall feedback with strengths and areas for improvement.")
    messages: list[dict] = Field(default_factory=list, description="All messages from the conversation.")
    feedback_items: list[dict] = Field(default_factory=list, description="All feedback items from the conversation.")
