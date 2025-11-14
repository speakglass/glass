"""Feedback submission endpoint that relays to Discord."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..auth.jwt import AuthenticatedUser, require_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter()


class FeedbackRequest(BaseModel):
    feedback: str = Field(..., min_length=1, max_length=2000)
    reaction: Literal["good", "bad"] | None = None


class FeedbackResponse(BaseModel):
    success: bool


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: Request,
    payload: FeedbackRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> FeedbackResponse:
    """Accept authenticated feedback submissions and forward to Discord."""

    webhook = request.app.state.app_state.settings.discord_webhook_url
    if not webhook:
        logger.error("Discord webhook not configured; cannot accept feedback")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback system temporarily unavailable",
        )

    feedback_text = payload.feedback.strip()
    if not feedback_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feedback is required")

    reaction_map = {
        "good": {"emoji": "👍", "color": 0x10B981},
        "bad": {"emoji": "👎", "color": 0xEF4444},
    }
    reaction = reaction_map.get(payload.reaction or "")

    embed_fields = [
        {
            "name": "👤 User",
            "value": f"{user.name or 'Unknown'} ({user.email})",
            "inline": False,
        },
        {
            "name": "💬 Feedback",
            "value": feedback_text[:1024],
            "inline": False,
        },
    ]

    if reaction:
        embed_fields.insert(
            1,
            {
                "name": "😊 Reaction",
                "value": reaction["emoji"],
                "inline": True,
            },
        )

    embed = {
        "title": "📝 New Feedback",
        "color": reaction["color"] if reaction else 0x3B82F6,
        "fields": embed_fields,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "footer": {"text": "Glass Feedback System"},
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                webhook,
                json={"embeds": [embed]},
                headers={"Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        logger.exception("Failed to send feedback to Discord")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to forward feedback",
        ) from exc

    if resp.status_code >= 300:
        logger.error(
            "Discord webhook rejected feedback: %s %s",
            resp.status_code,
            resp.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to forward feedback",
        )

    logger.info("Feedback submitted by %s (%s)", user.user_id, user.email)
    return FeedbackResponse(success=True)
