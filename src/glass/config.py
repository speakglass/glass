"""Application configuration using Pydantic settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator


class Settings(BaseSettings):
    # OpenAI LLM
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_analysis_model: str = "gpt-5-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout: float = 15.0
    openai_role: str = "progress"
    
    # Deepgram ASR
    deepgram_key: str | None = None
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en"
    deepgram_encoding: str = "linear16"
    deepgram_sample_rate: int = 16000
    deepgram_interim_results: bool = True
    deepgram_utterance_end_ms: int | None = 3500
    deepgram_endpointing_ms: int | None = 2500
    
    # Zep Memory
    zep_api_key: str | None = None
    zep_project_id: str | None = None
    
    # ElevenLabs TTS
    elevenlabs_api_key: str | None = None
    elevenlabs_model: str = "eleven_flash_v2_5"
    elevenlabs_voice_id: str = "cgSgspJ2msm6clMCkdW9"  # Default voice (Female)
    elevenlabs_ai_voice_id: str = "iP95p4xoKVk53GoZ742B"  # AI voice (Male)
    
    # CORS
    allow_origin: str = "*"
    allow_credentials: bool = False
    max_ws_conn: int = 100
    
    # Security limits
    ws_max_message_bytes: int = 131072  # 128 KiB
    
    # Defaults
    default_tone: str = "neutral"
    default_language: str = "en"
    storage_dir: str = "./var/uploads"
    
    # Notifications
    discord_webhook_url: str | None = None
    
    # Conversation window for LLM context
    tail_size: int = 20
    
    # Redis (usage tracking)
    redis_url: str | None = None
    redis_cluster: bool | None = None
    
    # Free usage budget per client (in minutes) across sessions (None disables)
    free_minutes_per_user: int | None = 30
    
    # Database for account persistence (meeting history, auth metadata)
    database_url: str = "postgresql+asyncpg://glass:glass@localhost:5432/glass"
    
    # Shared secret for verifying service-to-service JWTs (required)
    auth_jwt_secret: str = Field(min_length=8)
    
    # Max number of historical conversations returned per request
    history_limit: int = 20
    
    # Logging
    log_level: str = "INFO"  # e.g., DEBUG, INFO, WARNING

    model_config = SettingsConfigDict(env_file=".env", env_prefix="GLASS_")

    # Coerce empty string/None-like values to None (disables limit)
    @field_validator("free_minutes_per_user", mode="before")
    @classmethod
    def _coerce_free_minutes(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            s = value.strip().lower()
            if s == "" or s in {"none", "null", "unset"}:
                return None
            # Let pydantic handle proper int parsing afterwards if it's numeric
        return value

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
