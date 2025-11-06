"""HTTP routes."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
import httpx

from ..schemas import (
    AskRequest,
    AskResponse,
    ImageUploadResponse,
    ConversationAnalysisRequest,
    ConversationAnalysisResponse,
)

router = APIRouter()


def _get_state(request: Request):
    return request.app.state.app_state


@router.post("/ask", response_model=AskResponse)
async def ask_endpoint(request: Request, payload: AskRequest) -> AskResponse:
    app_state = _get_state(request)
    session_id = payload.session_id or app_state.session_manager.new_session_id()
    pipeline = await app_state.session_manager.get_or_create(session_id)
    if payload.screen_context:
        await pipeline.handle_screen_hint(payload.screen_context)
    suggestion = await pipeline.handle_text_query(
        payload.text,
        tone=payload.tone or app_state.settings.default_tone,
        lang=payload.language or app_state.settings.default_language,
    )
    return AskResponse(
        session_id=session_id,
        answer=suggestion["text"],
        suggestions=[suggestion["text"]],
        notes=suggestion.get("notes", []),
    )


@router.post("/upload/image", response_model=ImageUploadResponse)
async def upload_image_endpoint(
    request: Request,
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
) -> ImageUploadResponse:
    app_state = _get_state(request)
    if file.content_type is None:
        raise HTTPException(status_code=400, detail="Missing content type.")
    session = session_id or app_state.session_manager.new_session_id()
    blob_id = uuid.uuid4().hex
    storage_dir = Path(app_state.settings.storage_dir).expanduser().resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".bin"
    file_path = storage_dir / f"{blob_id}{suffix}"
    payload = await file.read()
    file_path.write_bytes(payload)
    pipeline = await app_state.session_manager.get_or_create(session)
    await pipeline.handle_image(
        blob_id=blob_id,
        mime_type=file.content_type,
        local_path=str(file_path),
    )
    return ImageUploadResponse(session_id=session, blob_id=blob_id)


@router.post("/analyze-conversation", response_model=ConversationAnalysisResponse)
async def analyze_conversation_endpoint(
    request: Request,
    payload: ConversationAnalysisRequest,
) -> ConversationAnalysisResponse:
    """Analyze a conversation session and return scores, extracted info, and overall feedback."""
    app_state = _get_state(request)
    
    # Get the pipeline for this session
    pipeline = await app_state.session_manager.get_or_create(payload.session_id)
    
    # Run analysis
    analysis = await pipeline.analyze_conversation()
    
    # Convert full conversation and feedback to dicts for response
    messages = []
    for msg in pipeline.full_conversation:
        message_dict = {
            "speaker": msg.get("speaker", "unknown"),
            "source": msg.get("source", "unknown"),
            "text": msg.get("text", ""),
        }
        # Add utterance_id if present
        if "utterance_id" in msg:
            message_dict["utterance_id"] = msg["utterance_id"]
        # Add translation if available
        utterance_id = msg.get("utterance_id")
        if utterance_id and utterance_id in pipeline.llm_processor._translations:
            message_dict["translation"] = pipeline.llm_processor._translations[utterance_id]
        messages.append(message_dict)
    
    feedback_items = [
        {
            "utterance_id": fb.get("utterance_id", ""),
            "text": fb.get("text", ""),
        }
        for fb in pipeline.llm_processor.all_feedback
    ]
    
    return ConversationAnalysisResponse(
        session_id=payload.session_id,
        scores=analysis["scores"],
        extracted_info=analysis["extracted_info"],
        feedback=analysis.get("feedback", ""),
        messages=messages,
        feedback_items=feedback_items,
    )


# --- Waitlist --------------------------------------------------------------

class WaitlistRequest(BaseModel):
    email: str
    sessionId: str | None = None
    scores: dict | None = None
    extractedInfo: list[dict] | None = None


@router.post("/waitlist")
async def waitlist_endpoint(request: Request, payload: WaitlistRequest) -> dict:
    app_state = _get_state(request)
    email = (payload.email or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    # Log entry (can be replaced with DB write)
    try:
        request.app.logger if hasattr(request.app, "logger") else None
    except Exception:
        pass

    webhook = app_state.settings.discord_webhook_url
    if not webhook:
        # Configuration error: fail fast so ops can fix
        raise HTTPException(status_code=500, detail="Discord webhook not configured")

    # Build a compact embed
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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                webhook,
                json={"content": "**Waitlist signup**", "embeds": [embed]},
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code >= 300:
                raise HTTPException(status_code=502, detail="Failed to notify waitlist")
    except Exception:
        raise

    return {"success": True}
