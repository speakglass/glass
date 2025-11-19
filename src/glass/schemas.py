"""Pydantic schemas for HTTP and WebSocket payloads."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ConversationAnalysisRequest(BaseModel):
    session_id: str = Field(..., description="Session identifier for the conversation to analyze.")


class ConversationScores(BaseModel):
    fluency: float = Field(..., ge=0, le=100, description="Fluency score (0-100).")
    accuracy: float = Field(..., ge=0, le=100, description="Accuracy score (0-100).")
    comprehensibility: float = Field(..., ge=0, le=100, description="Comprehensibility score (0-100).")


class ConversationAnalysisResponse(BaseModel):
    session_id: str
    scores: ConversationScores
    initial_memories: list[dict[str, Any]] = Field(
        default_factory=list, description="Seed memories captured alongside the analysis."
    )
    feedback: str = Field(..., description="Overall feedback with strengths and areas for improvement.")
    messages: list[dict] = Field(default_factory=list, description="All messages from the conversation.")
    feedback_items: list[dict] = Field(default_factory=list, description="All feedback items from the conversation.")
