"""JWT helpers for validating authenticated requests."""

from __future__ import annotations

from typing import Annotated, Any

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from ..config import Settings, get_settings


class AuthenticatedUser(BaseModel):
    """User claims embedded in the service JWT issued by the Next.js frontend."""

    user_id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None


def _parse_bearer_token(raw_header: str | None, required: bool) -> str | None:
    if not raw_header:
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header",
            )
        return None
    scheme, _, token = raw_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header",
        )
    return token


def decode_service_token(token: str, settings: Settings) -> AuthenticatedUser:
    """Validate and decode the JWT coming from the frontend."""
    import logging
    logger = logging.getLogger(__name__)
    
    if not settings.auth_jwt_secret:
        logger.error("[JWT] Auth secret is not configured on the API")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth secret is not configured on the API",
        )
    
    logger.debug(f"[JWT] Attempting to decode token (secret length: {len(settings.auth_jwt_secret)})")
    
    try:
        decode_kwargs: dict[str, Any] = {
            "algorithms": ["HS256"],
            "options": {"require": ["sub", "email"], "verify_aud": False},
        }
        payload = jwt.decode(
            token,
            settings.auth_jwt_secret,
            **decode_kwargs,
        )
        logger.debug(f"[JWT] Token decoded successfully for user: {payload.get('sub')}")
    except jwt.ExpiredSignatureError as exc:
        logger.error(f"[JWT] Token expired: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token expired",
        ) from exc
    except jwt.PyJWTError as exc:  # pragma: no cover - library detail
        logger.error(f"[JWT] Token decode failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc
    
    return AuthenticatedUser(
        user_id=str(payload["sub"]),
        email=str(payload["email"]),
        name=payload.get("name"),
        avatar_url=payload.get("picture") or payload.get("avatar"),
    )


def require_authenticated_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """FastAPI dependency that ensures the request has a valid JWT."""
    token = _parse_bearer_token(authorization, required=True)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return decode_service_token(token, settings)


def optional_authenticated_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser | None:
    """Dependency that resolves to a user when a valid Authorization header is present."""
    token = _parse_bearer_token(authorization, required=False)
    if token is None:
        return None
    return decode_service_token(token, settings)
