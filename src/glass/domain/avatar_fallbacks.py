"""Curated stock avatars for fallback usage when generation fails."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence


GenderLiteral = Literal["male", "female", "non-binary"]


@dataclass(frozen=True)
class AvatarFallback:
    url: str
    genders: Sequence[GenderLiteral] | None = None
    countries: Sequence[str] | None = None
    min_age: int | None = None
    max_age: int | None = None


FALLBACK_AVATARS: list[AvatarFallback] = [
    # Teens (17-19)
    AvatarFallback(
        url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
        genders=("male", "non-binary"),
        min_age=17,
        max_age=19,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
        genders=("female", "non-binary"),
        min_age=17,
        max_age=19,
    ),
    # Early 20s - Western
    AvatarFallback(
        url="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=20,
        max_age=24,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=20,
        max_age=24,
    ),
    # Early 20s - East Asian
    AvatarFallback(
        url="https://images.unsplash.com/photo-1616091216791-a5360b5fc78a?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("japan", "south korea"),
        min_age=20,
        max_age=24,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("japan", "south korea"),
        min_age=20,
        max_age=24,
    ),
    # Early 20s - Latin/Hispanic
    AvatarFallback(
        url="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("mexico", "colombia", "argentina", "spain", "peru"),
        min_age=20,
        max_age=24,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("mexico", "colombia", "argentina", "spain", "peru"),
        min_age=20,
        max_age=24,
    ),
    # Late 20s - Western
    AvatarFallback(
        url="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=25,
        max_age=29,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=25,
        max_age=29,
    ),
    # Late 20s - East Asian
    AvatarFallback(
        url="https://images.unsplash.com/photo-1601288496920-b6154fe3626a?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("japan", "south korea", "china"),
        min_age=25,
        max_age=29,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("japan", "south korea", "china"),
        min_age=25,
        max_age=29,
    ),
    # Late 20s - European
    AvatarFallback(
        url="https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("france", "belgium"),
        min_age=25,
        max_age=29,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("france", "belgium"),
        min_age=25,
        max_age=29,
    ),
    # 30s - Western
    AvatarFallback(
        url="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=30,
        max_age=39,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("united states", "canada", "united kingdom", "australia", "ireland"),
        min_age=30,
        max_age=39,
    ),
    # 30s - East Asian
    AvatarFallback(
        url="https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("south korea", "japan", "china"),
        min_age=30,
        max_age=39,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("south korea", "japan", "china"),
        min_age=30,
        max_age=39,
    ),
    # 30s - Latin/Hispanic
    AvatarFallback(
        url="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        countries=("mexico", "colombia", "argentina", "spain", "peru"),
        min_age=30,
        max_age=39,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        countries=("mexico", "colombia", "argentina", "spain", "peru"),
        min_age=30,
        max_age=39,
    ),
    # 40s-50s
    AvatarFallback(
        url="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
        genders=("female",),
        min_age=40,
        max_age=55,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80",
        genders=("male",),
        min_age=40,
        max_age=55,
    ),
    # Generic fallbacks - attractive and professional
    AvatarFallback(
        url="https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=600&q=80",
        genders=("female", "non-binary"),
        min_age=17,
        max_age=55,
    ),
    AvatarFallback(
        url="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
        genders=("male", "non-binary"),
        min_age=17,
        max_age=55,
    ),
]


def _normalize(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower()


def choose_fallback_avatar(*, gender: str | None, country: str | None, age: int | None) -> str | None:
    """Pick the best matching fallback avatar for the persona."""

    normalized_gender = _normalize(gender)
    normalized_country = _normalize(country)
    normalized_age = age

    best: tuple[int, AvatarFallback] | None = None
    for candidate in FALLBACK_AVATARS:
        score = 0
        if normalized_gender and candidate.genders:
            if normalized_gender not in candidate.genders:
                continue
            score += 2
        elif normalized_gender and not candidate.genders:
            score += 1

        if normalized_country and candidate.countries:
            if normalized_country in candidate.countries:
                score += 3
            else:
                continue
        elif normalized_country and not candidate.countries:
            score += 1

        if normalized_age is not None:
            if candidate.min_age is not None and normalized_age < candidate.min_age:
                continue
            if candidate.max_age is not None and normalized_age > candidate.max_age:
                continue
            score += 2

        if best is None or score > best[0]:
            best = (score, candidate)

    if best:
        return best[1].url

    # Final fallback to first entry if nothing matched
    return FALLBACK_AVATARS[0].url if FALLBACK_AVATARS else None
