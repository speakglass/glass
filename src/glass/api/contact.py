"""Contact/sales inquiry endpoint that relays to Discord."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..auth.jwt import AuthenticatedUser, optional_authenticated_user
from ..utils.discord import send_discord_notification

logger = logging.getLogger(__name__)

router = APIRouter()


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=255)
    company: str | None = Field(default=None, max_length=120)
    company_size: str | None = Field(default=None, max_length=64)
    message: str = Field(..., min_length=1, max_length=2000)


class ContactResponse(BaseModel):
    success: bool


@router.post("/contact", response_model=ContactResponse)
async def submit_contact(
    request: Request,
    payload: ContactRequest,
    user: AuthenticatedUser | None = Depends(optional_authenticated_user),
) -> ContactResponse:
    """Accept contact/sales inquiries and forward to Discord."""

    webhook = request.app.state.app_state.settings.discord_webhook_url
    if not webhook:
        logger.error("Discord webhook not configured; cannot accept contact requests")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Contact system temporarily unavailable",
        )

    name = payload.name.strip()
    email = payload.email.strip()
    company = (payload.company or "").strip()
    company_size = (payload.company_size or "").strip()
    message = payload.message.strip()

    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required")

    if user is None and (not name or not email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name and email are required")

    # Determine who is making the request
    requester_name = (user.name or "Unknown") if user else (name or "Unknown")
    requester_email = user.email if user else email
    requester_label = f"{requester_name} ({requester_email})"

    # Display values (use provided if available, fallback to authenticated user)
    name_display = name if name else ((user.name or "—") if user else "—")
    email_display = email if email else (user.email if user else "—")

    embed_fields = [
        {"name": "👤 User", "value": requester_label, "inline": False},
        {"name": "📛 Name", "value": name_display, "inline": True},
        {"name": "📧 Email", "value": email_display, "inline": True},
    ]

    if company:
        embed_fields.append({"name": "🏢 Company", "value": company[:256], "inline": True})

    if company_size:
        embed_fields.append({"name": "👥 Company Size", "value": company_size[:128], "inline": True})

    embed_fields.append({"name": "💬 Message", "value": message[:1024], "inline": False})

    embed = {
        "title": "📩 Contact Sales Inquiry",
        "color": 0xF97316,  # Orange
        "fields": embed_fields,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "footer": {"text": "Glass Contact System"},
    }

    try:
        await send_discord_notification(
            webhook,
            embeds=[embed],
            fail_silently=False,
        )
    except Exception as exc:
        logger.exception("Failed to send contact inquiry to Discord")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to submit inquiry",
        ) from exc

    logger.info("Contact inquiry submitted by %s (%s)", requester_name, requester_email)
    return ContactResponse(success=True)
