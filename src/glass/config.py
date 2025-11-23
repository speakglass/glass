"""Application configuration using Pydantic settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    # Provider selection
    llm_provider: str = "gemini"
    asr_provider: str = "deepgram"
    tts_provider: str = "elevenlabs"
    memory_provider: str = "postgres"
    embedding_provider: str = "openai"  # "openai", "gemini", or "none" to disable semantic search

    # OpenAI LLM
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout: float = 15.0

    # Gemini LLM
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/models"
    gemini_timeout: float = 15.0
    gemini_image_model: str = "gemini-3-pro-image-preview"
    gemini_image_size: str = "1K"
    gemini_image_timeout_seconds: float = 60.0
    gemini_image_retry_attempts: int = 2

    # Deepgram ASR
    deepgram_key: str | None = None
    deepgram_utterance_end_ms: int | None = 1000
    deepgram_endpointing_ms: int | None = 1000
    deepgram_enable_vad_events: bool = True

    # ElevenLabs TTS
    elevenlabs_api_key: str | None = None
    elevenlabs_model: str = "eleven_flash_v2_5"
    elevenlabs_voice_id: str = "cgSgspJ2msm6clMCkdW9"  # Default voice (Female)
    elevenlabs_ai_voice_id: str = "iP95p4xoKVk53GoZ742B"  # AI voice (Male)

    # Memory settings
    memory_cache_ttl: int = 180

    # CORS
    allow_origin: str = "*"
    allow_credentials: bool = False
    max_ws_conn: int = 100

    # Security limits
    ws_max_message_bytes: int = 131072  # 128 KiB

    # Notifications
    discord_webhook_url: str | None = None

    # Resend email service (optional - if not set, email verification is disabled)
    resend_api_key: str | None = None
    from_email: str = "Glass <hello@updates.speakglass.com>"
    frontend_url: str = "http://localhost:3000"
    # Resend template IDs (optional - if not set, uses inline HTML)
    resend_verification_template_id: str | None = None
    resend_password_reset_template_id: str | None = None

    # Redis (shared caching / background tasks)
    redis_url: str | None = None

    # Database for account persistence (meeting history, auth metadata)
    database_url: str = "postgresql+asyncpg://glass:glass@localhost:5432/glass"

    # Shared secret for verifying service-to-service JWTs (required)
    auth_jwt_secret: str = Field(min_length=8)

    # Logging
    log_level: str = "INFO"  # e.g., DEBUG, INFO, WARNING

    # Azure Blob Storage for media uploads
    azure_blob_connection_string: str | None = None
    azure_blob_container: str | None = None
    azure_blob_public_base_url: str | None = None
    azure_blob_api_version: str | None = None
    azure_blob_public_access: str | None = None
    azure_blob_sign_urls: bool | None = None
    azure_blob_signed_url_ttl_seconds: int = 60 * 60 * 24 * 365  # 1 year

    # Billing / Stripe
    self_hosted: bool = True
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_monthly_amount_cents: int = 2499
    stripe_yearly_amount_cents: int = 19999
    billing_currency: str = "usd"
    free_tier_conversation_limit: int | None = None
    free_tier_roleplay_partner_limit: int | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="GLASS_")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
