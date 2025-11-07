"""Application configuration using Pydantic settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_vision_model: str = "gpt-4.1-mini"
    openai_analysis_model: str = "gpt-5-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout: float = 15.0
    openai_role: str = "progress"
    llm_provider: str = "echo"
    vision_provider: str = "null"
    deepgram_key: str | None = None
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en"
    deepgram_encoding: str = "linear16"
    deepgram_sample_rate: int = 16000
    deepgram_interim_results: bool = True
    deepgram_utterance_end_ms: int | None = 1500
    deepgram_endpointing_ms: int | None = 1200
    graphiti_key: str | None = None
    graphiti_base_url: str = "https://api.graphiti.ai/v1"
    graphiti_upsert_path: str = "/graph/upsert"
    graphiti_retrieve_path: str = "/graph/retrieve"
    graphiti_timeout: float = 10.0
    memory_provider: str = "local"
    allow_origin: str = "*"
    allow_credentials: bool = False
    max_ws_conn: int = 100
    # Security limits (minimal defaults)
    ws_max_session_seconds: int = 120
    ws_max_message_bytes: int = 131072  # 128 KiB
    # Conversation length cap for auto-ending sessions (None disables)
    max_full_conversation: int | None = None
    default_tone: str = "neutral"
    default_language: str = "en"
    storage_dir: str = "./var/uploads"
    asr_provider: str = "null"
    diarization_provider: str = "null"
    nvidia_api_key: str | None = None
    nvidia_api_url: str | None = None
    nvidia_asr_model: str = "nvidia/parakeet-tdt-0.6b-v3"
    nvidia_diarization_model: str = "nvidia/diar_streaming_sortformer_4spk-v2"
    nvidia_diarization_url: str | None = None
    nvidia_language: str = "en-US"
    nvidia_diarization: bool = False
    nvidia_max_speakers: int = 4
    # ElevenLabs TTS
    elevenlabs_api_key: str | None = None
    elevenlabs_model: str = "eleven_flash_v2_5"
    elevenlabs_voice_id: str = "cgSgspJ2msm6clMCkdW9"  # Default voice (Female)
    elevenlabs_ai_voice_id: str = "iP95p4xoKVk53GoZ742B"  # AI voice (Male)
    # Notifications
    discord_webhook_url: str | None = None
    # Conversation window for LLM context
    tail_size: int = 20
    # Optional Redis (usage tracking)
    redis_url: str | None = None
    # Free usage budget per client (in minutes) across sessions (None disables)
    free_minutes_per_user: int | None = 30
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
