from __future__ import annotations

import base64
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, constr

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..adapters.tts import build_tts_adapter
from ..config import get_settings

router = APIRouter(prefix="/voices", tags=["voices"])
LOGGER = logging.getLogger(__name__)
DEFAULT_SAMPLE_TEXT = "Hi! I'm your Glass AI partner. Ready to start practicing together?"


class VoicePreviewRequest(BaseModel):
    voice_id: constr(min_length=1, max_length=255)
    sample_text: constr(min_length=1, max_length=600) | None = None


class VoicePreviewResponse(BaseModel):
    audio_base64: str
    mime_type: str = "audio/mpeg"


@router.post("/preview", response_model=VoicePreviewResponse)
async def preview_voice_endpoint(
    payload: VoicePreviewRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> VoicePreviewResponse:
    """Generate a short ElevenLabs preview clip for the requested voice."""

    settings = get_settings()
    tts_adapter = build_tts_adapter(settings)
    if not tts_adapter:
        raise HTTPException(status_code=503, detail="TTS is not configured")

    text = (payload.sample_text or DEFAULT_SAMPLE_TEXT).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Sample text cannot be empty")

    chunks: list[bytes] = []
    async for chunk in tts_adapter.synthesize_stream(text, voice_id=payload.voice_id):
        if chunk:
            chunks.append(chunk)

    if not chunks:
        LOGGER.error("Voice preview synthesis returned no data")
        raise HTTPException(status_code=502, detail="Failed to synthesize preview audio")

    audio_bytes = b"".join(chunks)
    audio_base64 = base64.b64encode(audio_bytes).decode("ascii")

    return VoicePreviewResponse(audio_base64=audio_base64)
