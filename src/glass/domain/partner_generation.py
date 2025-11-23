"""Utilities for generating custom conversation partner personas."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from dataclasses import dataclass
from textwrap import dedent
from typing import Literal, Sequence

from pydantic import BaseModel, Field, ConfigDict

from ..adapters.llm import LLMAdapter
from ..utils.language import lang_code_to_name
from . import prompts

LOGGER = logging.getLogger(__name__)

# Age range mapping for LLM guidance
AGE_RANGE_MAP = {
    "teens": "17-19",
    "early20s": "20-24",
    "late20s": "25-29",
    "thirties": "30-39",
    "forties": "40-49",
}

# Language to nationality mapping
LANG_TO_NATIONALITY = {
    "ko": ["Korean"],
    "ja": ["Japanese"],
    "zh": ["Chinese"],
    "es": ["Spanish", "Mexican", "Argentinian"],
    "fr": ["French", "Belgian", "Québécois"],
    "en": ["American", "British", "Australian", "Canadian", "Irish"],
}

NAME_GUIDANCE = {
    "Korean": ["Minho", "Jiwon", "Seojun", "Yuna", "Dohyun", "Sora", "Hyunwoo", "Jiho", "Hana", "Gyuwon"],
    "Japanese": ["Haruto", "Yuki", "Kaito", "Aiko", "Sota", "Hina", "Ren", "Sakura", "Mao", "Itsuki"],
    "Chinese": ["Wei", "Mei", "Jun", "Ling", "Chen", "Xia", "Haoran", "Yuxin", "Lina", "Guang"],
    "Spanish": ["Diego", "Sofia", "Mateo", "Isabella", "Lucas", "Valentina", "Hugo", "Camila"],
    "Mexican": ["Mariana", "Emiliano", "Paulina", "Rodrigo", "Ximena", "Santiago", "Itzel", "Gael"],
    "Argentinian": ["Camila", "Bautista", "Abril", "Mateo", "Delfina", "Tomás", "Juana", "Lautaro"],
    "French": ["Julien", "Camille", "Lucas", "Emma", "Antoine", "Léa", "Clara", "Hugo", "Maëlys"],
    "Belgian": ["Louise", "Arthur", "Lucas", "Clara", "Hugo", "Juliette", "Noor", "Baptiste"],
    "Québécois": ["Léa", "Olivier", "Maëlle", "Émile", "Florence", "Samuel", "Rosalie", "Mathis"],
    "American": ["Adrian", "Maya", "Liam", "Zara", "Marcus", "Nova", "Kai", "Sierra", "Asher", "Naomi"],
    "British": ["Amelia", "Alfie", "Freya", "Theo", "Imogen", "Oliver", "Phoebe", "Callum"],
    "Australian": ["Matilda", "Cooper", "Isla", "Lachlan", "Talia", "Finn", "Zoe", "Nate"],
    "Canadian": ["Avery", "Noah", "Chloe", "Ethan", "Harper", "Logan", "Mila", "Declan"],
    "Irish": ["Saoirse", "Niall", "Aisling", "Cian", "Niamh", "Ronan", "Orla", "Padraig"],
}

LOW_PROFICIENCY_LEVELS = {"zero", "beginner"}


class VoiceProfile(BaseModel):
    """Metadata for supported ElevenLabs voices per language."""

    id: str
    name: str
    description: str
    gender: Literal["male", "female", "non-binary"] | None = None
    style: str | None = None


ELEVENLABS_LANGUAGE_VOICES: dict[str, list[VoiceProfile]] = {
    "en": [
        VoiceProfile(
            id="21m00Tcm4TlvDq8ikWAM",
            name="Rachel",
            description="Friendly North American female voice that sounds like a warm late-20s tutor.",
            gender="female",
            style="modern",
        ),
        VoiceProfile(
            id="pNInz6obpgDQGcFmaJgB",
            name="Antoni",
            description="Smooth, confident American male mentor vibe reminiscent of someone in his early 30s.",
            gender="male",
            style="confident",
        ),
        VoiceProfile(
            id="IKne3meq5aSn9XLyUdCD",
            name="Alex",
            description="Neutral North American male voice that feels like a mid-30s professional.",
            gender="male",
            style="neutral",
        ),
        VoiceProfile(
            id="AZnzlk1XvdvUeBnXmlld",
            name="Bella",
            description="Soft British tone that feels like a mid-30s conversational coach.",
            gender="female",
            style="warm",
        ),
        VoiceProfile(
            id="TxGEqnHWrfWFTfGW9XjX",
            name="Elli",
            description="Delicate storyteller voice capturing an early-20s narrator.",
            gender="female",
            style="storytelling",
        ),
        # Female mature voices
        VoiceProfile(
            id="RILOU7YmBhvwJGDGjNmP",
            name="Jane",
            description="Professional, calm female narrator with the gravitas of someone in her 50s.",
            gender="female",
            style="narrative",
        ),
        # Female young voices
        VoiceProfile(
            id="Awx8TeMHHpDzbm42nIB6",
            name="Kristen",
            description="Warm, down-to-earth young female voice that feels mid-20s.",
            gender="female",
            style="casual",
        ),
        VoiceProfile(
            id="TbMNBJ27fH2U0VgpSNko",
            name="Lori",
            description="Happy, upbeat female voice with playful early-20s energy.",
            gender="female",
            style="bright",
        ),
        VoiceProfile(
            id="uYXf8XasLslADfZ2MB4u",
            name="Hope",
            description="Conversational best-friend tone capturing a relatable mid-20s friend.",
            gender="female",
            style="conversational",
        ),
        VoiceProfile(
            id="DtsPFCrhbCbbJkwZsb3d",
            name="Piper",
            description="Millennial BFF style—chatty and approachable late-20s female voice.",
            gender="female",
            style="friendly",
        ),
        VoiceProfile(
            id="kdmDKE6EkgrWrrykO9Qt",
            name="Alexandra",
            description="Youthful, authentic conversational female voice in her early 20s.",
            gender="female",
            style="realistic",
        ),
        # Male young voices
        VoiceProfile(
            id="kdVjFjOXaqExaDvXZECX",
            name="Burt",
            description="Calm, grounded young male narrator sounding late-20s.",
            gender="male",
            style="relaxed",
        ),
        VoiceProfile(
            id="s0XGIcqmceN2l7kjsqoZ",
            name="Lucas",
            description="Warm neutral-accent male voice with casual mid-20s charm.",
            gender="male",
            style="casual",
        ),
        VoiceProfile(
            id="UgBBYS2sOqTuMpoF3BR0",
            name="Mark",
            description="Natural conversational young male voice like a late-20s friend.",
            gender="male",
            style="conversational",
        ),
        # Male mature voices
        VoiceProfile(
            id="wAGzRVkxKEs8La0lmdrE",
            name="Sully",
            description="Deep mature American male voice with the weight of someone in his 50s.",
            gender="male",
            style="deep",
        ),
        VoiceProfile(
            id="qAZH0aMXY8tw1QufPN0D",
            name="Flint",
            description="Commanding, raspy male voice that feels like a seasoned 50-something leader.",
            gender="male",
            style="authoritative",
        ),
    ],
    "ko": [
        VoiceProfile(
            id="cgSgspJ2msm6clMCkdW9",
            name="Sena",
            description="Warm and calm Korean female voice reminiscent of a late-20s tutor.",
            gender="female",
            style="calm",
        ),
        VoiceProfile(
            id="iP95p4xoKVk53GoZ742B",
            name="Minjun",
            description="Bright, energetic Korean male voice that feels mid-20s.",
            gender="male",
            style="energetic",
        ),
    ],
    "es": [
        VoiceProfile(
            id="qHkrJuifPpn95wK3rm2A",
            name="Camila",
            description="Vibrant Mexico City female DJ vibe in her late 20s.",
            gender="female",
            style="energetic",
        ),
        VoiceProfile(
            id="94zOad0g7T7K4oa7zhDq",
            name="Diego",
            description="Madrid sports journalist tone with early-30s energy.",
            gender="male",
            style="confident",
        ),
    ],
    "fr": [
        VoiceProfile(
            id="F1toM6PcP54s45kOOAyV",
            name="Claire",
            description="Parisian female strategist voice sounding mid-30s.",
            gender="female",
            style="warm",
        ),
        VoiceProfile(
            id="93nuHbke4dTER9x2pDwE",
            name="Luc",
            description="Lyon male designer voice with relaxed late-30s cadence.",
            gender="male",
            style="calm",
        ),
    ],
    "ja": [
        VoiceProfile(
            id="fUjY9K2nAIwlALOwSiwc",
            name="Yui",
            description="Tokyo cafe owner voice that feels like a friendly late-20s woman.",
            gender="female",
            style="friendly",
        ),
        VoiceProfile(
            id="3JDquces8E8bkmvbh6Bc",
            name="Haruto",
            description="Osaka male developer tone with upbeat early-30s energy.",
            gender="male",
            style="casual",
        ),
    ],
    "default": [],
}


@dataclass
class PersonaPreferences:
    learning_lang: str | None
    native_lang: str | None
    topics: Sequence[str]
    partner_type: Literal["new_friends", "someone_special", "professional", "figuring_out"]
    gender: Literal["male", "female", "beyond_binary", "everyone"]
    age_range: Literal["teens", "early20s", "late20s", "thirties", "forties"]
    language_level: str | None = None


class PersonaCoreResponse(BaseModel):
    """Initial persona draft without long-form background."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="First name only, e.g., 'Emma', 'Kai'")
    summary: str = Field(
        ...,
        description="One sentence self-introduction in first person{LANG_INSTRUCTION}, e.g., {SUMMARY_EXAMPLE}",
    )
    age: int = Field(..., ge=17, le=60, description="Age as a number")
    gender: Literal["male", "female", "non-binary"]
    occupation: str = Field(..., description="Job title only{LANG_INSTRUCTION}, e.g., {OCCUPATION_EXAMPLE}")
    city: str = Field(..., description="City name only{LANG_INSTRUCTION}, e.g., {CITY_EXAMPLE}")
    country: str = Field(..., description="Country name only{LANG_INSTRUCTION}, e.g., {COUNTRY_EXAMPLE}")
    interests: list[str] = Field(
        default_factory=list, description="List of 3-6 short hobby phrases{LANG_INSTRUCTION}, e.g., {INTERESTS_EXAMPLE}"
    )


class PersonaLLMResponse(BaseModel):
    """Structured response from the persona generation pipeline."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="First name only, e.g., 'Emma', 'Kai'")
    summary: str = Field(
        ...,
        description="One sentence self-introduction in first person, e.g., 'I'm a software engineer in SF who loves hiking'",
    )
    age: int = Field(..., description="Specific age number")
    gender: Literal["male", "female", "non-binary"] = Field(..., description="male, female, or non-binary")
    occupation: str = Field(..., description="Job title only, e.g., 'Software Engineer', 'Teacher'")
    city: str = Field(..., description="City name only, e.g., 'San Francisco', 'Tokyo'")
    country: str = Field(..., description="Country name only, e.g., 'USA', 'Japan'")
    background: str = Field(
        "", description="Self-introduction paragraph in first person, telling about daily life and interests"
    )
    interests: list[str] = Field(default_factory=list, description="3-5 hobby phrases, e.g., 'hiking', technology'")
    avatar_prompt_text: str | None = Field(default=None, description="Natural language avatar prompt")


class LocalizedPersonaContent(BaseModel):
    """Localized persona text for low proficiency learners."""

    model_config = ConfigDict(extra="ignore")

    summary: str = Field(
        ..., max_length=500, description="Self-introduction sentence translated to native language (first person)"
    )
    background: str | None = Field(
        None, description="Translated persona background paragraph (first person, native language)"
    )
    interests: list[str] = Field(default_factory=list, description="Translated list of interests as short phrases")
    occupation: str | None = Field(
        None, max_length=100, description="Translated job title only, e.g., 'English Teacher', 'Software Developer'"
    )
    city: str | None = Field(
        None, max_length=100, description="Translated city name only, e.g., 'San Francisco', 'Tokyo'"
    )
    country: str | None = Field(None, max_length=100, description="Translated country name only, e.g., 'USA', 'Japan'")


def _choose_nationality(code: str | None) -> str:
    choices = LANG_TO_NATIONALITY.get(code or "en")
    if not choices:
        return "American"
    if isinstance(choices, str):
        return choices
    if len(choices) == 1:
        return choices[0]
    # Use the first configured nationality instead of randomizing to keep language selections predictable.
    return list(choices)[0]


def _build_name_guidance(nationality: str, gender: Literal["male", "female", "non-binary"]) -> str:
    gender_hint = {
        "male": "masculine",
        "female": "feminine",
        "non-binary": "inclusive or gender-neutral",
    }.get(gender, "natural-sounding")
    return f"Choose a {gender_hint} first name that fits a {nationality} background. Generate diverse, varied names each time."


async def _localize_background(
    llm_adapter: LLMAdapter,
    *,
    background: str,
    native_language_name: str,
) -> str:
    """Translate background text separately (it's usually long)."""
    system_prompt = (
        f"Translate the following self-introduction to {native_language_name}. Preserve the first-person perspective."
    )

    response = await llm_adapter.call(
        system=system_prompt,
        messages=[{"role": "user", "content": background}],
        temperature=0.2,
    )
    if isinstance(response, str):
        return response.strip()
    return str(response).strip()


async def _localize_persona_content(
    llm_adapter: LLMAdapter,
    *,
    summary: str,
    background: str | None,
    occupation: str | None,
    city: str | None,
    country: str | None,
    interests: list[str],
    source_language_name: str,
    native_language_name: str,
) -> LocalizedPersonaContent:
    """Translate persona summary/background into the learner's native language."""

    async def _translate_field(text: str | None) -> str | None:
        if not text:
            return text
        translated = await _translate_text(
            llm_adapter,
            text=text,
            source_language_name=source_language_name,
            target_language_name=native_language_name,
        )
        return translated or text

    summary_translated, background_translated, occupation_translated, city_translated, country_translated = (
        await asyncio.gather(
            _translate_field(summary),
            _translate_field(background),
            _translate_field(occupation),
            _translate_field(city),
            _translate_field(country),
        )
    )

    interests_translated: list[str] = []
    if interests:
        translated_list = await asyncio.gather(*(_translate_field(item) for item in interests))
        interests_translated = [item.strip() for item in translated_list if isinstance(item, str) and item.strip()]

    return LocalizedPersonaContent(
        summary=summary_translated or summary,
        background=background_translated or background,
        occupation=occupation_translated or occupation,
        city=city_translated or city,
        country=country_translated or country,
        interests=interests_translated or interests,
    )


async def generate_partner_persona(
    llm_adapter: LLMAdapter,
    preferences: PersonaPreferences,
) -> tuple[PersonaLLMResponse, LocalizedPersonaContent | None]:
    """Call the LLM to synthesize a persona."""
    import time

    start_time = time.time()
    LOGGER.info(
        "Persona generation starting (lang=%s, level=%s, topics=%d, type=%s, gender=%s, age=%s)",
        preferences.learning_lang,
        preferences.language_level,
        len(preferences.topics),
        preferences.partner_type,
        preferences.gender,
        preferences.age_range,
    )

    topics = [topic for topic in preferences.topics if topic.strip()]

    # Select gender based on preference
    selected_gender: Literal["male", "female", "non-binary"]
    if preferences.gender == "everyone":
        selected_gender = random.choice(["male", "female", "non-binary"])
    elif preferences.gender == "beyond_binary":
        selected_gender = "non-binary"
    elif preferences.gender == "male":
        selected_gender = "male"
    else:  # female
        selected_gender = "female"

    # Get age range and nationality
    age_range_str = AGE_RANGE_MAP.get(preferences.age_range, "25-35")
    nationality = _choose_nationality(preferences.learning_lang)
    name_guidance = _build_name_guidance(nationality, selected_gender)

    target_lang_name = lang_code_to_name(preferences.learning_lang) if preferences.learning_lang else ""

    LOGGER.debug(
        "Persona params: nationality=%s, gender=%s, age_range=%s, target_lang=%s",
        nationality,
        selected_gender,
        age_range_str,
        target_lang_name,
    )

    system_prompt = dedent(
        """
        You are an expert persona designer for language conversation partners.
        Create believable, modern characters that feel human and culturally authentic.
        Generate diverse, unique personas with varied names each time.
        """
    ).strip()

    localization_instruction = ""
    if target_lang_name:
        localization_instruction = dedent(
            f"""
            IMPORTANT: Write ALL text fields (summary, background, occupation, city, country, interests) entirely in {target_lang_name}.
            Make it sound natural for a native {target_lang_name} speaker.
            Use first-person perspective in {target_lang_name}.
            """
        ).strip()
        LOGGER.info("Generating persona directly in %s (level=%s)", target_lang_name, preferences.language_level)

    variety_instruction = dedent(
        """
        Keep the persona description concise but lively. Vary occupations, backstories, and locales so profiles
        feel distinct—avoid repeating the same archetype. Let the topics inspire the persona without forcing a rigid mapping.
        """
    ).strip()

    core_start = time.time()
    LOGGER.debug("Generating persona core...")
    persona_core = await _generate_persona_core(
        llm_adapter=llm_adapter,
        preferences=preferences,
        nationality=nationality,
        age_range_str=age_range_str,
        selected_gender=selected_gender,
        name_guidance=name_guidance,
        topics=topics,
        system_prompt=system_prompt,
        variety_instruction=variety_instruction,
        localization_instruction=localization_instruction,
        native_lang_name=target_lang_name or None,
    )
    core_elapsed = time.time() - core_start
    LOGGER.info("✓ Persona core generated in %.2fs (name=%s)", core_elapsed, persona_core.name)

    persona = PersonaLLMResponse(
        name=persona_core.name,
        summary=persona_core.summary,
        age=persona_core.age,
        gender=persona_core.gender,
        occupation=persona_core.occupation,
        city=persona_core.city,
        country=persona_core.country,
        background="",
        interests=[interest.strip() for interest in persona_core.interests if interest.strip()],
    )

    # Start background and avatar prompt generation in parallel
    bg_start = time.time()
    LOGGER.info("Starting background and avatar prompt generation in parallel...")
    background_task = asyncio.create_task(
        _generate_persona_background(
            llm_adapter=llm_adapter,
            persona=persona,
            topics=topics,
            native_lang_name=target_lang_name or None,
        )
    )
    avatar_prompt_task = asyncio.create_task(_generate_avatar_prompt_text(llm_adapter, persona))

    # Wait for both tasks to complete in parallel
    background_text = ""
    avatar_prompt_text = None
    try:
        background_text, avatar_prompt_text = await asyncio.gather(
            background_task,
            avatar_prompt_task,
            return_exceptions=True,
        )
        bg_elapsed = time.time() - bg_start

        # Handle background result
        if isinstance(background_text, Exception):
            LOGGER.warning("Persona background generation failed after %.2fs: %s", bg_elapsed, background_text)
            background_text = ""
        else:
            LOGGER.info(
                "✓ Background & avatar prompt generated in %.2fs (background: %d chars)",
                bg_elapsed,
                len(background_text) if background_text else 0,
            )

        # Handle avatar prompt result
        if isinstance(avatar_prompt_text, Exception):
            LOGGER.warning("Avatar prompt generation failed: %s", avatar_prompt_text)
            avatar_prompt_text = None

    except Exception as exc:  # pragma: no cover - defensive fallback
        LOGGER.warning("Parallel generation failed after %.2fs: %s", time.time() - bg_start, exc)

    persona.background = background_text or persona.background
    persona.avatar_prompt_text = avatar_prompt_text

    elapsed = time.time() - start_time
    LOGGER.info(
        "✓ Persona generation completed in %.2fs (name=%s, age=%d, gender=%s, occupation=%s)",
        elapsed,
        persona.name,
        persona.age,
        persona.gender,
        persona.occupation,
    )
    localization: LocalizedPersonaContent | None = None
    if preferences.learning_lang and preferences.native_lang and preferences.learning_lang != preferences.native_lang:
        LOGGER.info("Localizing persona content to native language: %s", preferences.native_lang)
        LOGGER.info("Persona summary: %s", persona.summary)
        LOGGER.info("Persona background: %s", persona.background)
        LOGGER.info("Persona occupation: %s", persona.occupation)
        LOGGER.info("Persona city: %s", persona.city)
        LOGGER.info("Persona country: %s", persona.country)
        LOGGER.info("Persona interests: %s", persona.interests)
        LOGGER.info("Persona name: %s", persona.name)
        LOGGER.info("Persona age: %d", persona.age)
        LOGGER.info("Persona gender: %s", persona.gender)
        native_lang_name = lang_code_to_name(preferences.native_lang)
        source_lang_name = lang_code_to_name(preferences.learning_lang)
        localization = await _localize_persona_content(
            llm_adapter,
            summary=persona.summary,
            background=persona.background,
            occupation=persona.occupation,
            city=persona.city,
            country=persona.country,
            interests=persona.interests,
            source_language_name=source_lang_name,
            native_language_name=native_lang_name,
        )
        LOGGER.info("✓ Persona content localized to native language: %s", native_lang_name)
        LOGGER.info("Localized persona summary: %s", localization.summary)
        LOGGER.info("Localized persona background: %s", localization.background)
        LOGGER.info("Localized persona occupation: %s", localization.occupation)
        LOGGER.info("Localized persona city: %s", localization.city)
        LOGGER.info("Localized persona country: %s", localization.country)
        LOGGER.info("Localized persona interests: %s", localization.interests)

    return persona, localization


async def generate_avatar_image_bytes(
    prompt: str,
    *,
    api_key: str | None,
    model: str,
    image_size: str | None = None,
) -> bytes | None:
    """Use Google Gemini image generation API to generate an avatar from the prompt."""

    if not api_key:
        LOGGER.warning("Skipping avatar generation; Gemini API key not configured")
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        LOGGER.warning("google-genai not installed; cannot generate avatar (%s)", exc)
        return None

    client = genai.Client(api_key=api_key)

    # Parse image_size (e.g., "768x768" -> "1:1" aspect ratio, "1K" resolution)
    # Default to 1:1 aspect ratio and 1K resolution
    aspect_ratio = "1:1"
    resolution = image_size or "1K"

    # If image_size looks like "WxH", convert to aspect ratio and use 1K
    if image_size and "x" in image_size:
        try:
            w, h = image_size.lower().split("x")
            w_int, h_int = int(w), int(h)
            # Simplify common ratios
            if w_int == h_int:
                aspect_ratio = "1:1"
            else:
                aspect_ratio = f"{w_int}:{h_int}"
            resolution = "1K"
        except (ValueError, AttributeError):
            pass

    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                    image_size=resolution,
                ),
            ),
        )
    except Exception as exc:  # pragma: no cover - API/network failures
        LOGGER.warning(f"Gemini image generation failed: {exc}")
        return None

    if not response or not hasattr(response, "parts"):
        LOGGER.warning("Image generation returned no response or parts")
        return None

    for part in response.parts:
        image = part.as_image()
        if image and hasattr(image, "image_bytes"):
            return image.image_bytes

    LOGGER.warning("No image found in response parts")
    return None


def compress_interests(interests: Sequence[str]) -> str:
    """Serialize persona interests for storage."""

    cleaned = [interest.strip() for interest in interests if interest.strip()]
    return ", ".join(cleaned)


async def _generate_persona_core(
    *,
    llm_adapter: LLMAdapter,
    preferences: PersonaPreferences,
    nationality: str,
    age_range_str: str,
    selected_gender: Literal["male", "female", "non-binary"],
    name_guidance: str,
    topics: Sequence[str],
    system_prompt: str,
    variety_instruction: str,
    localization_instruction: str,
    native_lang_name: str | None = None,
) -> PersonaCoreResponse:
    user_prompt = dedent(
        f"""
        Create a unique conversation partner persona:
        
        Language: {preferences.learning_lang or "English"}
        Nationality: {nationality}
        Gender: {selected_gender}
        Age range: {age_range_str}
        Topics: {", ".join(topics)}
        
        Name guidance: {name_guidance}
        IMPORTANT: Generate a completely unique name each time. Avoid repeating common names like Ethan, Emma, Lucas, etc.
        Be creative and diverse with your name choices while keeping them culturally appropriate.
        
        Write the summary field as a self-introduction in first person (using "I").
        """
    ).strip()
    instructions = [user_prompt, variety_instruction]
    if localization_instruction:
        instructions.append(localization_instruction)
    prompt = "\n\n".join(instructions)

    # Build schema context for language-specific descriptions
    schema_context = {}
    if native_lang_name:
        schema_context = {
            "LANG_INSTRUCTION": f" (write in {native_lang_name})",
            "SUMMARY_EXAMPLE": "'I'm a software engineer in SF'",
            "OCCUPATION_EXAMPLE": "'Software Engineer', 'Teacher'",
            "CITY_EXAMPLE": "'San Francisco', 'Tokyo'",
            "COUNTRY_EXAMPLE": "'USA', 'Japan'",
            "INTERESTS_EXAMPLE": "['hiking', 'technology']",
        }
    else:
        schema_context = {
            "LANG_INSTRUCTION": "",
            "SUMMARY_EXAMPLE": "'I'm a software engineer in SF'",
            "OCCUPATION_EXAMPLE": "'Software Engineer', 'Teacher'",
            "CITY_EXAMPLE": "'San Francisco', 'Tokyo'",
            "COUNTRY_EXAMPLE": "'USA', 'Japan'",
            "INTERESTS_EXAMPLE": "['hiking', 'technology']",
        }

    response = await llm_adapter.call(
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
        response_schema=PersonaCoreResponse,
        schema_context=schema_context,
        temperature=0.85,
    )
    if isinstance(response, PersonaCoreResponse):
        return response
    if isinstance(response, dict):
        return PersonaCoreResponse(**response)
    return PersonaCoreResponse.model_validate(response)


async def _generate_persona_background(
    *,
    llm_adapter: LLMAdapter,
    persona: PersonaLLMResponse,
    topics: Sequence[str],
    native_lang_name: str | None = None,
) -> str:
    system_prompt = dedent(
        """
        You write warm, compact self-introductions for language-learning partners.
        Write in first person as if the persona is introducing themselves.
        Keep it modern, grounded in real life, and easy to read.
        """
    ).strip()

    lang_instruction = ""
    if native_lang_name:
        lang_instruction = (
            f"\n\nIMPORTANT: Write the entire response in {native_lang_name} (the language used in the summary above)."
        )

    user_prompt = dedent(
        f"""
        Persona name: {persona.name}
        Persona summary:
        {persona.summary}

        Persona occupation: {persona.occupation}
        Persona city: {persona.city}
        Persona country: {persona.country}
        Persona interests: {", ".join(persona.interests)}
        Topics to weave: {", ".join(topics)}

        Write 3-4 sentences in first person (using "I") describing their past, daily routines, and what excites them now. Mention the persona's name once so it feels like a natural introduction.{lang_instruction}
        """
    ).strip()

    response = await llm_adapter.call(
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.6,
    )
    if isinstance(response, str):
        return response.strip()
    if isinstance(response, dict):
        return json.dumps(response, ensure_ascii=False).strip()
    return str(response).strip()


async def _generate_avatar_prompt_text(llm_adapter: LLMAdapter, persona: PersonaLLMResponse) -> str | None:
    """Call the LLM to turn persona attributes into natural photo keywords."""
    origin_phrase = persona.country or persona.city or ""
    origin_text = f" from {origin_phrase}" if origin_phrase else ""

    appearance_descriptor = ""
    if persona.gender == "male":
        appearance_descriptor = "handsome"
    elif persona.gender == "female":
        appearance_descriptor = "pretty"
    elif persona.gender == "non-binary":
        appearance_descriptor = "androgynously attractive"

    subject_stub = f"{appearance_descriptor or 'natural-looking'} {persona.gender or 'person'} in their {persona.age or '20s'} years old{origin_text}".strip()

    # Generate detailed photo description keywords using LLM
    system_prompt = dedent(
        """
        You are an expert at generating detailed, comma-separated keywords that describe profile photos.
        Generate 10 specific, visual keywords that would help create a realistic profile photo.
        Focus on visual details like appearance, clothing style, setting, expression, and atmosphere.
        Be specific and descriptive, but keep each keyword concise.
        Return ONLY the keywords as a comma-separated list, nothing else.
        """
    ).strip()

    user_prompt = dedent(
        f"""
        Generate 10 detailed visual keywords for a profile photo based on this persona:
        
        Gender: {persona.gender}
        Age: {persona.age}
        Location: {persona.city}, {persona.country}
        Occupation: {persona.occupation}
        Interests: {", ".join(persona.interests)}
        
        Example output format: "casual streetwear, warm smile, coffee shop background, natural makeup, relaxed posture, friendly eyes, modern hairstyle, smartphone in hand, urban setting, soft afternoon light"
        
        Generate 10 keywords that describe the photo itself (not the person's personality):
        """
    ).strip()

    try:
        response = await llm_adapter.call(
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7,
        )

        if isinstance(response, str):
            llm_keywords = response.strip()
        elif isinstance(response, dict):
            llm_keywords = response.get("keywords", "")
        else:
            llm_keywords = str(response).strip()

        # Clean up the keywords
        llm_keywords = llm_keywords.strip().strip('"').strip("'")

    except Exception as exc:
        LOGGER.warning("LLM keyword generation failed: %s. Using fallback keywords.", exc)
        # Fallback to basic keywords
        llm_keywords = f"casual style, natural expression, {persona.occupation} vibe, friendly demeanor"

    positive_prompt = dedent(
        f"""
        Hyperealistic Amateur photography, Captured on an iphone phone, Candid, 23mm focal length, detailed, Realism, casual photography, natural lighting, modern camera vibe, background also in focus, add tiny imperfections, imperfect, everyday aesthetic, 2020 vibe, amateur photo, slight JPEG artifacts, shot on mobile phone, Grain in dark areas, unpolished look, unedited snapshot, {persona.age or '20s'} years old, {persona.gender or 'person'}, {llm_keywords}
    """
    ).strip()
    negative_prompt = dedent(
        f"""
        No date and time on photo this isn't a cctv footage, No intense colors, No intense filters, No Cinematic vibe, No vignette, No Background Blur, No perfect composition, subject shouldn't be exactly centered, less symmetry, No low resolution, No grain
    """
    ).strip()

    return f"Positive Prompt: {positive_prompt}\nNegative Prompt: {negative_prompt}"


class VoiceSelectionResponse(BaseModel):
    """Structured answer when the LLM picks an ElevenLabs voice."""

    voice_id: str
    reasoning: str | None = None


class VoiceSelectionError(RuntimeError):
    """Raised when the LLM voice selection cannot be resolved."""


def _voice_options_for_language(lang_code: str | None) -> list[VoiceProfile]:
    normalized = (lang_code or "").lower()
    candidates = []
    if normalized:
        parts = [normalized]
        if "-" in normalized:
            parts.append(normalized.split("-")[0])
        for key in parts:
            options = ELEVENLABS_LANGUAGE_VOICES.get(key)
            if options:
                candidates = options
                break
    if not candidates:
        candidates = ELEVENLABS_LANGUAGE_VOICES.get("default", [])
    return candidates


def _normalize_voice_key(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _resolve_voice_id(candidate_value: str | None, candidates: list[VoiceProfile]) -> str | None:
    """Map the LLM response back to a known voice ID."""

    if not candidate_value:
        return None
    stripped = candidate_value.strip().strip('"').strip("'")
    if not stripped:
        return None

    id_lookup: dict[str, str] = {}
    normalized_lookup: dict[str, str] = {}
    for voice in candidates:
        id_lookup[voice.id] = voice.id
        id_lookup[voice.id.lower()] = voice.id
        normalized_lookup[_normalize_voice_key(voice.id)] = voice.id
        normalized_lookup[_normalize_voice_key(voice.name)] = voice.id

    if stripped in id_lookup:
        return id_lookup[stripped]
    lowered = stripped.lower()
    if lowered in id_lookup:
        return id_lookup[lowered]

    normalized = _normalize_voice_key(stripped)
    if normalized and normalized in normalized_lookup:
        return normalized_lookup[normalized]

    for voice in candidates:
        voice_id_lower = voice.id.lower()
        voice_name_lower = voice.name.lower()
        if voice_id_lower in lowered or voice_name_lower in lowered:
            return voice.id
    return None


async def select_voice_for_persona(
    llm_adapter: LLMAdapter,
    persona: PersonaLLMResponse,
    *,
    learning_lang: str | None,
) -> str:
    """Ask the LLM to choose the best ElevenLabs voice for the persona."""
    import time

    start_time = time.time()
    LOGGER.info(
        "Voice selection starting (persona=%s, age=%s, gender=%s, lang=%s)",
        persona.name,
        persona.age,
        persona.gender,
        learning_lang,
    )

    candidates = _voice_options_for_language(learning_lang)
    if not candidates:
        raise VoiceSelectionError(f"No ElevenLabs voices configured for language '{learning_lang or 'default'}'.")

    LOGGER.debug("Found %d voice candidates for language %s", len(candidates), learning_lang)
    catalog = "\n".join(f"{voice.id} ({voice.name}): {voice.description}" for voice in candidates)
    system_prompt = dedent(
        """
        You are a casting director choosing ElevenLabs voices for language-learning AI personas.
        Pick the voice that fits the persona's vibe, age, and gender while staying friendly for learners.
        """
    ).strip()
    user_prompt = dedent(
        f"""
        Persona details:
        Name: {persona.name}
        Age: {persona.age}
        Gender identity: {persona.gender}

        Available voices (voice_id - description):
        {catalog}
        """
    ).strip()

    llm_start = time.time()
    LOGGER.debug("Calling LLM for voice selection...")
    response = await llm_adapter.call(
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        response_schema=VoiceSelectionResponse,
        temperature=0.2,
    )
    llm_elapsed = time.time() - llm_start
    LOGGER.debug("LLM voice selection call completed in %.2fs", llm_elapsed)
    candidate_id: str | None = None
    if isinstance(response, VoiceSelectionResponse):
        candidate_id = response.voice_id
    elif isinstance(response, dict):
        candidate_id = response.get("voice_id")
    else:
        try:
            validated = VoiceSelectionResponse.model_validate(response)
            candidate_id = validated.voice_id
        except Exception:
            candidate_id = None

    resolved_candidate = _resolve_voice_id(candidate_id, candidates)
    if resolved_candidate:
        elapsed = time.time() - start_time
        LOGGER.info(
            "✓ Voice selection completed in %.2fs (selected=%s for %s)",
            elapsed,
            resolved_candidate,
            persona.name,
        )
        return resolved_candidate

    elapsed = time.time() - start_time
    LOGGER.error(
        "✗ Voice selection failed after %.2fs: invalid voice_id=%r (persona=%s)",
        elapsed,
        candidate_id,
        persona.name,
    )
    raise VoiceSelectionError(
        f"LLM returned an invalid voice identifier: {candidate_id!r}. Unable to match against catalog."
    )


async def _translate_text(
    llm_adapter: LLMAdapter,
    *,
    text: str,
    source_language_name: str,
    target_language_name: str,
) -> str | None:
    system_prompt, user_prompt = prompts.build_translation_prompt(text, source_language_name, target_language_name)
    try:
        response = await llm_adapter.call(
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.2,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        LOGGER.warning("Translation request failed: %s", exc)
        return None

    if isinstance(response, str):
        return response.strip()
    if isinstance(response, dict):
        text_value = response.get("text")
        if isinstance(text_value, str):
            return text_value.strip()
    return str(response).strip() if response else None
