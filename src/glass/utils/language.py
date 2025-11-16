"""Language utilities."""

from __future__ import annotations


def lang_code_to_name(code: str) -> str:
    """Convert language code to full name.
    
    Args:
        code: ISO 639-1 language code (e.g., 'en', 'ko')
        
    Returns:
        Full language name (e.g., 'English', 'Korean')
    """
    lang_map = {
        'en': 'English',
        'ko': 'Korean',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'es': 'Spanish',
        'fr': 'French',
    }
    return lang_map.get(code, code.capitalize())

