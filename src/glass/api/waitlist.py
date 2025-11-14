from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

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
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            webhook,
            json={"content": "**Waitlist signup**", "embeds": [embed]},
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code >= 300:
            raise HTTPException(status_code=502, detail="Failed to notify waitlist")

    return {"success": True}
