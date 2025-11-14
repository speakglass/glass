from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str
    sessionId: str | None = None
    scores: dict | None = None
    extractedInfo: list[dict] | None = None


@router.post("/waitlist")
async def waitlist_endpoint(request: Request, payload: WaitlistRequest) -> dict:
    app_state = request.app.state.app_state
    email = (payload.email or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    webhook = app_state.settings.discord_webhook_url
    if not webhook:
        raise HTTPException(status_code=500, detail="Discord webhook not configured")

    embed = {
        "title": "New Waitlist Entry",
        "color": 0x00BCD4,
        "fields": [
            {"name": "Email", "value": email, "inline": False},
        ],
    }
    if payload.sessionId:
        embed["fields"].append({"name": "Session ID", "value": payload.sessionId, "inline": False})
    if payload.scores:
        embed["fields"].append({"name": "Scores", "value": f"```json\n{payload.scores}\n```", "inline": False})
    if payload.extractedInfo:
        embed["fields"].append({"name": "Extracted Info", "value": f"```json\n{payload.extractedInfo}\n```", "inline": False})

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            webhook,
            json={"content": "**Waitlist signup**", "embeds": [embed]},
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code >= 300:
            raise HTTPException(status_code=502, detail="Failed to notify waitlist")

    return {"success": True}
