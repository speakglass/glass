from __future__ import annotations

import asyncio
import logging
import mimetypes
from pathlib import Path
from typing import Literal, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, File
from pydantic import BaseModel, HttpUrl, constr

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..config import get_settings
from ..persistence.service import (
    create_partner,
    delete_partner,
    get_partner_by_id,
    list_partners,
    update_partner,
)
from ..utils.blob_storage import AzureBlobUploader, build_partner_avatar_blob_name

router = APIRouter(prefix="/partners", tags=["partners"])
LOGGER = logging.getLogger(__name__)
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5MB


class PartnerResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    avatar_url: HttpUrl | str | None = None
    voice_id: str | None = None
    learning_lang: str | None = None
    native_lang: str | None = None
    is_system: bool
    kind: Literal["roleplay", "live_call"]
    extra_metadata: dict[str, Any] | None = None


class PartnerListResponse(BaseModel):
    partners: list[PartnerResponse]


class PartnerCreateRequest(BaseModel):
    name: constr(min_length=1, max_length=255)
    description: constr(max_length=500) | None = None
    learning_lang: constr(min_length=2, max_length=8) | None = None
    native_lang: constr(min_length=2, max_length=8) | None = None
    avatar_url: HttpUrl | str | None = None
    voice_id: constr(max_length=255) | None = None


class PartnerUpdateRequest(BaseModel):
    name: constr(min_length=1, max_length=255) | None = None
    description: constr(max_length=500) | None = None
    learning_lang: constr(min_length=2, max_length=8) | None = None
    native_lang: constr(min_length=2, max_length=8) | None = None
    avatar_url: HttpUrl | str | None = None
    voice_id: constr(max_length=255) | None = None


def _serialize_partner(partner) -> PartnerResponse:
    meta = partner.extra_metadata or {}
    kind_value: Literal["roleplay", "live_call"] = "live_call" if not partner.voice_id else "roleplay"
    intrinsic_kind = getattr(partner, "kind", None)
    if intrinsic_kind in {"roleplay", "live_call"}:
        kind_value = cast(Literal["roleplay", "live_call"], intrinsic_kind)
    return PartnerResponse(
        id=partner.id,
        slug=partner.slug,
        name=partner.name,
        description=partner.description,
        avatar_url=partner.avatar_url,
        voice_id=partner.voice_id,
        learning_lang=partner.learning_lang,
        native_lang=partner.native_lang,
        is_system=bool(partner.user_id is None),
        kind=kind_value,
        extra_metadata=meta or None,
    )


@router.get("", response_model=PartnerListResponse)
async def list_partners_endpoint(
    request: Request,
    learning_lang: str | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerListResponse:
    db = request.app.state.history_store
    partners = await list_partners(db, user.user_id, learning_lang=learning_lang)
    return PartnerListResponse(partners=[_serialize_partner(p) for p in partners])


@router.post("", response_model=PartnerResponse, status_code=201)
async def create_partner_endpoint(
    request: Request,
    payload: PartnerCreateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    db = request.app.state.history_store
    partner = await create_partner(
        db,
        user.user_id,
        name=payload.name,
        description=payload.description,
        learning_lang=payload.learning_lang,
        native_lang=payload.native_lang,
        avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
        voice_id=payload.voice_id,
    )
    return _serialize_partner(partner)


@router.patch("/{partner_id}", response_model=PartnerResponse)
async def update_partner_endpoint(
    request: Request,
    partner_id: str,
    payload: PartnerUpdateRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PartnerResponse:
    db = request.app.state.history_store
    try:
        partner = await update_partner(
            db,
            partner_id=partner_id,
            user_id=user.user_id,
            name=payload.name,
            description=payload.description,
            learning_lang=payload.learning_lang,
            native_lang=payload.native_lang,
            avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
            voice_id=payload.voice_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_partner(partner)


@router.delete("/{partner_id}", status_code=204, response_class=Response)
async def delete_partner_endpoint(
    request: Request,
    partner_id: str,
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
    partner_id: str,
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
    partner_id: str,
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
    extension = Path(filename).suffix if filename else None
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
