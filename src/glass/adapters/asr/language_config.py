"""Language configuration for Deepgram ASR."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DeepgramLanguageConfig:
    """Configuration for Deepgram language and model."""
    
    deepgram_code: str  # Deepgram language code (e.g., 'en', 'ko')
    model: str  # 'nova-3' or 'nova-2'


# Language mapping for supported languages
# Maps app language codes to Deepgram configuration
LANGUAGE_CONFIG: dict[str, DeepgramLanguageConfig] = {
    "en": DeepgramLanguageConfig(
        deepgram_code="en",
        model="nova-3"
    ),
    "ko": DeepgramLanguageConfig(
        deepgram_code="ko",
        model="nova-2"
    ),
    "ja": DeepgramLanguageConfig(
        deepgram_code="ja",
        model="nova-3"
    ),
    "es": DeepgramLanguageConfig(
        deepgram_code="es",
        model="nova-3"
    ),
    "fr": DeepgramLanguageConfig(
        deepgram_code="fr",
        model="nova-3"
    ),
    "zh": DeepgramLanguageConfig(
        deepgram_code="zh-CN",
        model="nova-2"
    ),
}


def get_deepgram_config(language_code: str) -> DeepgramLanguageConfig:
    """
    Get Deepgram configuration for a given language code.
    
    Args:
        language_code: Language code (e.g., 'en', 'ko', 'ja')
        
    Returns:
        DeepgramLanguageConfig with appropriate model and language code
        
    Raises:
        ValueError: If language code is not supported
    """
    if language_code not in LANGUAGE_CONFIG:
        # Default to English if language not supported
        return LANGUAGE_CONFIG["en"]
    
    return LANGUAGE_CONFIG[language_code]

