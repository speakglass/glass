from __future__ import annotations

import asyncio
import logging
import mimetypes
from pathlib import Path as PathlibPath
from typing import Annotated, Literal, cast, Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, Path as FastAPIPath
from pydantic import BaseModel, Field, HttpUrl, constr, field_validator

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..config import get_settings
from ..persistence.service import (
    ensure_user,
    create_partner,
    delete_partner,
    count_roleplay_partners,
    get_partner_by_id,
    list_partners,
    update_partner,
)
from ..utils.blob_storage import AzureBlobUploader, build_partner_avatar_blob_name
from ..services.partner_generation import (
    PartnerGenerationJob,
    PartnerGenerationJobStatus,
)
from ..services.limits import partner_limit_status

router = APIRouter(prefix="/partners", tags=["partners"])
LOGGER = logging.getLogger(__name__)
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5MB
PartnerIdPath = Annotated[str, FastAPIPath(min_length=1)]
GenerationJobIdPath = Annotated[str, FastAPIPath(min_length=1)]
LEARNING_LEVELS = {"zero", "beginner", "elementary", "intermediate", "advanced"}


async def _account_context(
    request: Request,
    user: AuthenticatedUser,
) -> tuple[Any, Any, dict[str, Any], Any]:
    db = request.app.state.history_store
    account_user = await ensure_user(db, user)
    app_state = getattr(request.app.state, "app_state", None)
    settings = getattr(app_state, "settings", None) or get_settings()
    billing_service = getattr(app_state, "billing_service", None)
    if billing_service:
        billing_payload = billing_service.user_status_payload(account_user)
    else:
        billing_payload = {"self_hosted": True, "active": True}
    return db, account_user, billing_payload, settings


async def _require_roleplay_capacity(
    *,
    db,
    account_user,
    billing_payload: dict[str, Any],
    settings,
) -> None:
    used = await count_roleplay_partners(db, user_id=account_user.id)
    quota = partner_limit_status(settings, billing_payload, used=used)
    if quota.blocked:
        raise HTTPException(status_code=403, detail="AI partner limit reached")


class PartnerResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    avatar_url: HttpUrl | str | None = None
    voice_id: str | None = None
    learning_lang: str | None = None
    native_lang: str | None = None
    kind: Literal["roleplay", "live_call"]
    persona_age: str | None = None
    persona_gender: str | None = None
    persona_occupation: str | None = None
    persona_city: str | None = None
    persona_country: str | None = None
    persona_relationship: str | None = None
    persona_background: str | None = None
    persona_interests: str | None = None
    conversation_count: int = 0


class PartnerListResponse(BaseModel):
    partners: list[PartnerResponse]


class PartnerCreateRequest(BaseModel):
    name: constr(min_length=1, max_length=255)
    description: constr(max_length=500) | None = None
    learning_lang: constr(min_length=2, max_length=8) | None = None
    native_lang: constr(min_length=2, max_length=8) | None = None
    avatar_url: HttpUrl | str | None = None
    persona_age: constr(max_length=32) | None = None
    persona_gender: constr(max_length=32) | None = None
    persona_occupation: constr(max_length=128) | None = None
    persona_city: constr(max_length=128) | None = None
    persona_country: constr(max_length=128) | None = None
    persona_relationship: constr(max_length=64) | None = None
    persona_background: constr(max_length=1000) | None = None
    persona_interests: constr(max_length=1000) | None = None


class PartnerUpdateRequest(BaseModel):
    name: constr(min_length=1, max_length=255) | None = None
    description: constr(max_length=500) | None = None
    learning_lang: constr(min_length=2, max_length=8) | None = None
    native_lang: constr(min_length=2, max_length=8) | None = None
    avatar_url: HttpUrl | str | None = None
    persona_age: constr(max_length=32) | None = None
    persona_gender: constr(max_length=32) | None = None
    persona_occupation: constr(max_length=128) | None = None
    persona_city: constr(max_length=128) | None = None
    persona_country: constr(max_length=128) | None = None
    persona_relationship: constr(max_length=64) | None = None
    persona_background: constr(max_length=1000) | None = None
    persona_interests: constr(max_length=1000) | None = None


class PartnerPersonaGenerateRequest(BaseModel):
    learning_lang: constr(min_length=2, max_length=8) | None = None
    native_lang: constr(min_length=2, max_length=8) | None = None
    language_level: constr(min_length=1, max_length=32) | None = None
    topics: list[constr(min_length=1, max_length=64)] = Field(default_factory=list)
    partner_type: Literal["new_friends", "someone_special", "professional", "figuring_out"]
    gender: Literal["male", "female", "beyond_binary", "everyone"]
    age_range: Literal["teens", "early20s", "late20s", "thirties", "forties"]

    @field_validator("language_level")
    @classmethod
    def validate_language_level(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in LEARNING_LEVELS:
            raise ValueError("Invalid language level")
        return normalized


PartnerGenerationStatusLiteral = Literal[
    "queued",
    "generating_persona",
    "selecting_voice",
    "saving_partner",
    "generating_avatar",
    "completed",
    "failed",
]
PartnerGenerationStepLiteral = Literal["persona", "voice", "partner", "avatar"]


class PartnerGenerationPersonaPreview(BaseModel):
    name: str | None = None
    summary: str | None = None
    persona_age: str | None = None
    persona_gender: str | None = None
    persona_occupation: str | None = None
    persona_city: str | None = None
    persona_country: str | None = None
    persona_background: str | None = None
    persona_interests: list[str] = Field(default_factory=list)


class PartnerGenerationJobResponse(BaseModel):
    job_id: str
    status: PartnerGenerationStatusLiteral
    message: str | None = None
    steps_completed: list[PartnerGenerationStepLiteral] = Field(default_factory=list)
    persona_preview: PartnerGenerationPersonaPreview | None = None
    partner: PartnerResponse | None = None
    error: str | None = None


def _serialize_partner(partner) -> PartnerResponse:
    kind_value: Literal["roleplay", "live_call"] = "live_call" if not partner.voice_id else "roleplay"
    intrinsic_kind = getattr(partner, "kind", None)
    if intrinsic_kind in {"roleplay", "live_call"}:
        kind_value = cast(Literal["roleplay", "live_call"], intrinsic_kind)
    return PartnerResponse(
        id=partner.id,
        name=partner.name,
        description=partner.description,
        avatar_url=partner.avatar_url,
        voice_id=partner.voice_id,
        learning_lang=partner.learning_lang,
        native_lang=partner.native_lang,
        kind=kind_value,
        persona_age=getattr(partner, "persona_age", None),
        persona_gender=getattr(partner, "persona_gender", None),
        persona_occupation=getattr(partner, "persona_occupation", None),
        persona_city=getattr(partner, "persona_city", None),
        persona_country=getattr(partner, "persona_country", None),
        persona_relationship=getattr(partner, "persona_relationship", None),
        persona_background=getattr(partner, "persona_background", None),
        persona_interests=getattr(partner, "persona_interests", None),
    )


def _job_to_response(job: PartnerGenerationJob) -> PartnerGenerationJobResponse:
    persona_preview = None
    if job.persona_preview:
        persona_preview = PartnerGenerationPersonaPreview(
            name=job.persona_preview.name,
            summary=job.persona_preview.summary,
            persona_age=job.persona_preview.persona_age,
            persona_gender=job.persona_preview.persona_gender,
            persona_occupation=job.persona_preview.persona_occupation,
            persona_city=job.persona_preview.persona_city,
            persona_country=job.persona_preview.persona_country,
            persona_background=job.persona_preview.persona_background,
            persona_interests=list(job.persona_preview.persona_interests),
        )
    partner_response = _serialize_partner(job.partner) if job.partner else None
    status_value = job.status.value if isinstance(job.status, PartnerGenerationJobStatus) else str(job.status)
    return PartnerGenerationJobResponse(
        job_id=job.id,
        status=cast(PartnerGenerationStatusLiteral, status_value),
        message=job.message,
        steps_completed=cast(list[PartnerGenerationStepLiteral], list(job.steps_completed)),
        persona_preview=persona_preview,
        partner=partner_response,
        error=job.error,
    )


@router.get("", response_model=PartnerListResponse)
async def list_partners_endpoint(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerListResponse:
    db = request.app.state.history_store
    partners = await list_partners(db, user.user_id)

    # Get conversation counts for each partner
    from glass.persistence.db import AccountConversation
    from sqlalchemy import select, func

    session_factory = db.session()
    async with session_factory() as session:
        # Query conversation counts grouped by partner
        stmt = (
            select(AccountConversation.partner_id, func.count(AccountConversation.id).label("count"))
            .where(AccountConversation.user_id == user.user_id, AccountConversation.partner_id.isnot(None))
            .group_by(AccountConversation.partner_id)
        )
        result = await session.execute(stmt)
        conversation_counts = {row.partner_id: row.count for row in result}

    # Serialize partners with conversation counts
    serialized_partners = []
    for p in partners:
        partner_response = _serialize_partner(p)
        partner_response.conversation_count = conversation_counts.get(p.id, 0)
        serialized_partners.append(partner_response)

    return PartnerListResponse(partners=serialized_partners)


@router.post("/generate", response_model=PartnerGenerationJobResponse, status_code=202)
async def generate_partner_endpoint(
    request: Request,
    payload: PartnerPersonaGenerateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerGenerationJobResponse:
    db, account_user, billing_payload, settings = await _account_context(request, user)
    await _require_roleplay_capacity(
        db=db,
        account_user=account_user,
        billing_payload=billing_payload,
        settings=settings,
    )
    app_state = getattr(request.app.state, "app_state", None)
    manager = getattr(app_state, "partner_generation_manager", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Persona generation is not configured")

    try:
        job = await manager.start_job(
            user_id=account_user.id,
            learning_lang=payload.learning_lang,
            native_lang=payload.native_lang,
            language_level=payload.language_level,
            topics=payload.topics,
            partner_type=payload.partner_type,
            gender=payload.gender,
            age_range=payload.age_range,
            billing_payload=billing_payload,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return _job_to_response(job)


@router.get("/generate/{job_id}", response_model=PartnerGenerationJobResponse)
async def get_generation_job_endpoint(
    request: Request,
    job_id: GenerationJobIdPath,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerGenerationJobResponse:
    app_state = getattr(request.app.state, "app_state", None)
    manager = getattr(app_state, "partner_generation_manager", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Persona generation is not configured")

    job = await manager.get_job(job_id, user_id=user.user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Generation job not found")
    return _job_to_response(job)


@router.post("", response_model=PartnerResponse, status_code=201)
async def create_partner_endpoint(
    request: Request,
    payload: PartnerCreateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    db, account_user, billing_payload, settings = await _account_context(request, user)
    partner = await create_partner(
        db,
        account_user.id,
        name=payload.name,
        description=payload.description,
        learning_lang=payload.learning_lang,
        native_lang=payload.native_lang,
        avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
        persona_age=payload.persona_age,
        persona_gender=payload.persona_gender,
        persona_relationship=payload.persona_relationship,
        persona_background=payload.persona_background,
        persona_interests=payload.persona_interests,
    )
    return _serialize_partner(partner)


@router.patch("/{partner_id}", response_model=PartnerResponse)
async def update_partner_endpoint(
    request: Request,
    partner_id: PartnerIdPath,
    payload: PartnerUpdateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    db, account_user, billing_payload, settings = await _account_context(request, user)
    existing_partner = await get_partner_by_id(db, partner_id, user_id=account_user.id)
    if not existing_partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    try:
        partner = await update_partner(
            db,
            partner_id=partner_id,
            user_id=account_user.id,
            name=payload.name,
            description=payload.description,
            learning_lang=payload.learning_lang,
            native_lang=payload.native_lang,
            avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
            persona_age=payload.persona_age,
            persona_gender=payload.persona_gender,
            persona_relationship=payload.persona_relationship,
            persona_background=payload.persona_background,
            persona_interests=payload.persona_interests,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_partner(partner)


@router.delete("/{partner_id}", status_code=204, response_class=Response)
async def delete_partner_endpoint(
    request: Request,
    partner_id: PartnerIdPath,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> Response:
    db = request.app.state.history_store
    try:
        await delete_partner(db, partner_id=partner_id, user_id=user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


@router.get("/{partner_id}", response_model=PartnerResponse)
async def get_partner_endpoint(
    request: Request,
    partner_id: PartnerIdPath,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    db = request.app.state.history_store
    partner = await get_partner_by_id(db, partner_id, user_id=user.user_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return _serialize_partner(partner)


@router.post("/{partner_id}/avatar", response_model=PartnerResponse)
async def upload_partner_avatar_endpoint(
    request: Request,
    partner_id: PartnerIdPath,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    settings = get_settings()
    if not settings.azure_blob_connection_string or not settings.azure_blob_container:
        raise HTTPException(status_code=503, detail="Image uploads are not configured")

    db = request.app.state.history_store

    # Ensure partner exists and user has access (also used to gate update)
    partner = await get_partner_by_id(db, partner_id, user_id=user.user_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    filename = file.filename or ""
    extension = PathlibPath(filename).suffix if filename else None
    if not extension:
        guessed_extension = mimetypes.guess_extension(content_type)
        extension = guessed_extension if guessed_extension not in {".jpe"} else ".jpg"

    uploader = AzureBlobUploader(
        settings.azure_blob_connection_string,
        settings.azure_blob_container,
        public_base_url=settings.azure_blob_public_base_url,
        api_version=settings.azure_blob_api_version,
        public_access=settings.azure_blob_public_access,
        require_signed_urls=settings.azure_blob_sign_urls,
        signed_url_ttl_seconds=settings.azure_blob_signed_url_ttl_seconds,
    )
    blob_name = build_partner_avatar_blob_name(user.user_id, partner_id, extension)

    try:
        blob_url = await asyncio.to_thread(
            uploader.upload_bytes,
            data,
            blob_name=blob_name,
            content_type=content_type,
        )
    except Exception as exc:  # pragma: no cover - azure SDK errors
        LOGGER.error("Failed to upload partner avatar to Azure Blob Storage: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to upload image") from exc

    try:
        updated_partner = await update_partner(
            db,
            partner_id=partner_id,
            user_id=user.user_id,
            avatar_url=blob_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return _serialize_partner(updated_partner)
