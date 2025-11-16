from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..persistence.service import (
    create_local_user,
    create_password_reset_token,
    create_verification_token,
    get_user_by_email,
    get_user_by_id,
    mark_onboarding_completed,
    mark_token_as_used,
    set_user_password,
    verify_email_token,
    verify_reset_token,
)
from ..auth.passwords import hash_password, verify_password

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str | None = Field(default=None, min_length=8)
    name: str | None = None


class OAuthSignInRequest(BaseModel):
    """Request for OAuth sign-in (e.g., Google)."""
    email: EmailStr
    name: str | None = None
    avatar_url: str | None = None


class VerifyRequest(BaseModel):
    email: EmailStr
    password: str


class AuthenticatedUserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str | None = None
    avatar_url: str | None = None
    message: str | None = None  # Optional message for special cases


@router.post("/accounts/register", response_model=AuthenticatedUserResponse)
async def register_account(request: Request, payload: RegisterRequest) -> AuthenticatedUserResponse:
    from .helpers import client_id_for_user
    from ..auth.jwt import AuthenticatedUser
    
    db = request.app.state.history_store
    app_state = request.app.state.app_state
    email_service = app_state.email_service
    settings = app_state.settings
    
    existing = await get_user_by_email(db, payload.email)
    
    # Hash password if provided (for email/password auth)
    password_hash = hash_password(payload.password) if payload.password else None
    
    if existing:
        # User exists
        if existing.password_hash and payload.password:
            # User already has a password, can't register again
            raise HTTPException(status_code=409, detail="Account already exists")
        elif payload.password and not existing.password_hash:
            # OAuth user setting password
            if not password_hash:
                raise HTTPException(status_code=400, detail="Failed to hash password")
            updated = await set_user_password(
                db,
                user_id=existing.id,
                password_hash=password_hash,
                name=payload.name,
            )
            return AuthenticatedUserResponse(
                id=updated.id,
                email=updated.email,
                name=updated.name,
                avatar_url=updated.avatar_url,
                message="Password added successfully",
            )
        else:
            # OAuth user already exists
            raise HTTPException(status_code=409, detail="Account already exists")
    
    # Create new user
    user = await create_local_user(
        db,
        email=payload.email,
        password_hash=password_hash,
        name=payload.name,
        bonus_minutes=None,  # Bonus minutes not granted by default
    )
    
    # Reset Redis quota for new user (clear any stale data from previous tests)
    if app_state.has_quota_tracking():
        try:
            client_id = client_id_for_user(AuthenticatedUser(user_id=user.id, email=user.email))
            # Delete old quota keys to start fresh
            if app_state._redis:
                await app_state._redis.delete(
                    f"glass:quota:{client_id}:end_at",
                    f"glass:quota:{client_id}"
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to reset quota for new user {user.id}: {e}")
    
    # Send verification email if Resend is configured
    if email_service.enabled:
        try:
            token, _ = await create_verification_token(db, user.id)
            verification_url = f"{settings.frontend_url}/en/verify-email?token={token}"
            await email_service.send_verification_email(
                to=user.email,
                name=user.name,
                verification_url=verification_url,
            )
            return AuthenticatedUserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                avatar_url=user.avatar_url,
                message="Please check your email to verify your account",
            )
        except Exception as e:
            # Log error but don't block registration
            import logging
            logging.getLogger(__name__).error(f"Failed to send verification email: {e}")
    
    # If no email service or OAuth user, mark as verified
    if not email_service.enabled or not password_hash:
        user.email_verified = True
        async_session_factory = db.session()
        async with async_session_factory() as session:
            session.add(user)
            await session.commit()
            await session.refresh(user)
    
    return AuthenticatedUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )


@router.post("/accounts/verify", response_model=AuthenticatedUserResponse)
async def verify_account(request: Request, payload: VerifyRequest) -> AuthenticatedUserResponse:
    db = request.app.state.history_store
    user = await get_user_by_email(db, payload.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if user has a password set (OAuth users might not have one)
    if not user.password_hash:
        raise HTTPException(
            status_code=401, 
            detail="This account uses Google Sign-In. Please login with Google or use 'Forgot Password' to set a password."
        )
    
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Allow login regardless of email verification status
    # Email verification will be checked when accessing protected routes (dashboard/onboarding)
    return AuthenticatedUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )


class VerifyOAuthRequest(BaseModel):
    email: EmailStr


@router.post("/accounts/verify-oauth", response_model=AuthenticatedUserResponse)
async def verify_oauth_account(request: Request, payload: VerifyOAuthRequest) -> AuthenticatedUserResponse:
    """Verify OAuth user exists in the database."""
    db = request.app.state.history_store
    user = await get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return AuthenticatedUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )


@router.post("/accounts/oauth-signin", response_model=AuthenticatedUserResponse)
async def oauth_signin(request: Request, payload: OAuthSignInRequest) -> AuthenticatedUserResponse:
    """Sign in or create user via OAuth (e.g., Google).
    
    This endpoint handles both new and existing OAuth users:
    - If user doesn't exist, creates new user without password
    - If user exists, updates name and avatar if provided
    """
    db = request.app.state.history_store
    user = await get_user_by_email(db, payload.email)
    
    if user:
        # Existing user - update profile if needed
        updated = False
        async_session_factory = db.session()
        async with async_session_factory() as session:
            if payload.name and payload.name != user.name:
                user.name = payload.name
                updated = True
            if payload.avatar_url and payload.avatar_url != user.avatar_url:
                user.avatar_url = payload.avatar_url
                updated = True
            
            if updated:
                session.add(user)
                await session.commit()
                await session.refresh(user)
        
        return AuthenticatedUserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
        )
    else:
        # New user - create without password (OAuth users are auto-verified)
        new_user = await create_local_user(
            db,
            email=payload.email,
            password_hash=None,  # OAuth users don't have passwords initially
            name=payload.name,
            avatar_url=payload.avatar_url,
            email_verified=True,  # OAuth users are automatically verified
            bonus_minutes=None,  # Bonus minutes not granted by default
        )
        
        # Reset Redis quota for new OAuth user (clear any stale data)
        app_state = request.app.state.app_state
        if app_state.has_quota_tracking():
            try:
                from .helpers import client_id_for_user
                from ..auth.jwt import AuthenticatedUser
                client_id = client_id_for_user(AuthenticatedUser(user_id=new_user.id, email=new_user.email))
                if app_state._redis:
                    await app_state._redis.delete(
                        f"glass:quota:{client_id}:end_at",
                        f"glass:quota:{client_id}"
                    )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to reset quota for new OAuth user {new_user.id}: {e}")
        
        return AuthenticatedUserResponse(
            id=new_user.id,
            email=new_user.email,
            name=new_user.name,
            avatar_url=new_user.avatar_url,
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


@router.post("/accounts/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(request: Request, payload: ForgotPasswordRequest) -> ForgotPasswordResponse:
    db = request.app.state.history_store
    app_state = request.app.state.app_state
    email_service = app_state.email_service
    settings = app_state.settings
    
    user = await get_user_by_email(db, payload.email)
    
    # Always return success to prevent email enumeration
    if not user:
        return ForgotPasswordResponse(message="If the email exists, a reset link has been sent")
    
    # Create reset token
    token = await create_password_reset_token(db, user_id=user.id, expires_in_hours=1)
    
    # Send email if Resend is configured
    if email_service.enabled:
        try:
            reset_url = f"{settings.frontend_url}/en/reset-password?token={token}"
            await email_service.send_password_reset_email(
                to=user.email,
                name=user.name,
                reset_url=reset_url,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send password reset email: {e}")
    else:
        # If no email service, log the token (development only!)
        import logging
        logging.getLogger(__name__).info(f"Password reset token for {user.email}: {token}")
    
    return ForgotPasswordResponse(message="If the email exists, a reset link has been sent")


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ResetPasswordResponse(BaseModel):
    message: str


@router.post("/accounts/reset-password", response_model=ResetPasswordResponse)
async def reset_password(request: Request, payload: ResetPasswordRequest) -> ResetPasswordResponse:
    db = request.app.state.history_store
    
    # Verify token
    user = await verify_reset_token(db, payload.token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Update password
    password_hash = hash_password(payload.new_password)
    await set_user_password(db, user_id=user.id, password_hash=password_hash)
    
    # Mark token as used
    await mark_token_as_used(db, payload.token)
    
    return ResetPasswordResponse(message="Password has been reset successfully")


class VerifyEmailRequest(BaseModel):
    token: str


class VerifyEmailResponse(BaseModel):
    message: str
    email: EmailStr


@router.post("/accounts/verify-email", response_model=VerifyEmailResponse)
async def verify_email(request: Request, payload: VerifyEmailRequest) -> VerifyEmailResponse:
    """Verify email address using token sent via email."""
    db = request.app.state.history_store
    
    # Verify token and mark email as verified
    user = await verify_email_token(db, payload.token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    return VerifyEmailResponse(
        message="Email verified successfully",
        email=user.email,
    )


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str


@router.post("/accounts/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(request: Request, payload: ResendVerificationRequest) -> ResendVerificationResponse:
    """Resend verification email."""
    db = request.app.state.history_store
    app_state = request.app.state.app_state
    email_service = app_state.email_service
    settings = app_state.settings
    
    if not email_service.enabled:
        raise HTTPException(status_code=503, detail="Email service not configured")
    
    user = await get_user_by_email(db, payload.email)
    
    # Always return success to prevent email enumeration
    if not user:
        return ResendVerificationResponse(message="If the email exists, a verification link has been sent")
    
    # Check if already verified
    if user.email_verified:
        return ResendVerificationResponse(message="Email is already verified")
    
    # Create new verification token
    try:
        token, _ = await create_verification_token(db, user.id)
        verification_url = f"{settings.frontend_url}/en/verify-email?token={token}"
        await email_service.send_verification_email(
            to=user.email,
            name=user.name,
            verification_url=verification_url,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to resend verification email: {e}")
    
    return ResendVerificationResponse(message="If the email exists, a verification link has been sent")


class OnboardingStatusResponse(BaseModel):
    completed: bool
    completed_at: str | None = None


@router.get("/accounts/me/onboarding", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> OnboardingStatusResponse:
    """Get the current user's onboarding status."""
    db = request.app.state.history_store
    account_user = await get_user_by_id(db, user.user_id)
    
    if not account_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return OnboardingStatusResponse(
        completed=account_user.onboarding_completed_at is not None,
        completed_at=account_user.onboarding_completed_at.isoformat() 
            if account_user.onboarding_completed_at else None,
    )


class CompleteOnboardingRequest(BaseModel):
    learning_lang: str
    native_lang: str
    proficiency: str  # 'cant_read' or 'can_read'


class CompleteOnboardingResponse(BaseModel):
    success: bool
    completed_at: str


@router.post("/accounts/me/onboarding/complete", response_model=CompleteOnboardingResponse)
async def complete_onboarding(
    request: Request,
    payload: CompleteOnboardingRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> CompleteOnboardingResponse:
    """Mark the user's onboarding as completed and save language preferences."""
    db = request.app.state.history_store
    
    try:
        updated_user = await mark_onboarding_completed(
            db,
            user.user_id,
            learning_lang=payload.learning_lang,
            native_lang=payload.native_lang,
            proficiency=payload.proficiency,
        )
        return CompleteOnboardingResponse(
            success=True,
            completed_at=updated_user.onboarding_completed_at.isoformat()
                if updated_user.onboarding_completed_at else "",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class UpdateLanguageSettingsRequest(BaseModel):
    learning_lang: str | None = None
    native_lang: str | None = None
    proficiency: str | None = None


class UpdateLanguageSettingsResponse(BaseModel):
    success: bool
    learning_lang: str | None
    native_lang: str | None
    proficiency: str | None


@router.patch("/accounts/me/languages", response_model=UpdateLanguageSettingsResponse)
async def update_language_settings(
    request: Request,
    payload: UpdateLanguageSettingsRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> UpdateLanguageSettingsResponse:
    """Update the user's language learning preferences."""
    db = request.app.state.history_store
    
    try:
        account_user = await get_user_by_id(db, user.user_id)
        if not account_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update only provided fields
        async_session_factory = db.session()
        async with async_session_factory() as session:
            if payload.learning_lang is not None:
                account_user.learning_lang = payload.learning_lang
            if payload.native_lang is not None:
                account_user.native_lang = payload.native_lang
            if payload.proficiency is not None:
                account_user.proficiency = payload.proficiency
            
            session.add(account_user)
            await session.commit()
            await session.refresh(account_user)
        
        return UpdateLanguageSettingsResponse(
            success=True,
            learning_lang=account_user.learning_lang,
            native_lang=account_user.native_lang,
            proficiency=account_user.proficiency,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

