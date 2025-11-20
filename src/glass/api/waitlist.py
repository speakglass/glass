from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..utils.discord import send_discord_notification

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str


@router.post("/waitlist")
async def waitlist_endpoint(request: Request, payload: WaitlistRequest) -> dict:
    app_state = request.app.state.app_state
    email = (payload.email or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    webhook = app_state.settings.discord_webhook_url
    if not webhook:
        raise HTTPException(status_code=500, detail="Discord webhook not configured")

    embed: dict[str, Any] = {
        "title": "New Waitlist Entry",
        "color": 0x00BCD4,
        "fields": [
            {"name": "Email", "value": email, "inline": False},
        ],
    }
    try:
        await send_discord_notification(
            webhook,
            content="**Waitlist signup**",
            embeds=[embed],
            fail_silently=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to notify waitlist") from exc

    return {"success": True}
