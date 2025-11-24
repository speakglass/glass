from __future__ import annotations

"""Utilities for sampling culturally aligned partner names from curated pools."""

import random
from typing import Iterable, Literal

from .data import LANGUAGE_NAME_POOLS, DEFAULT_LANGUAGE

GenderChoice = Literal["male", "female", "non-binary"]


def _normalize_code(code: str | None) -> str:
    if not code:
        return DEFAULT_LANGUAGE
    primary = code.split("-")[0].lower()
    if primary in LANGUAGE_NAME_POOLS:
        return primary
    return DEFAULT_LANGUAGE


def _prepare_exclusions(exclude: Iterable[str] | None) -> set[str]:
    if not exclude:
        return set()
    return {name.strip().lower() for name in exclude if name.strip()}


def _pick_from_pool(pool: dict[str, list[str]], buckets: Iterable[str], excluded: set[str]) -> str | None:
    for bucket in buckets:
        candidates = [name for name in pool.get(bucket, []) if name.lower() not in excluded]
        if candidates:
            return random.choice(candidates)
    return None


def choose_random_name(
    language_code: str | None,
    gender: GenderChoice,
    *,
    exclude: Iterable[str] | None = None,
) -> str | None:
    """
    Return a randomized partner name for the desired language and gender expression.

    Parameters
    ----------
    language_code:
        BCP-47 style language code (e.g., \"en\", \"es-MX\"). Falls back to English.
    gender:
        \"male\", \"female\", or \"non-binary\" to bias the name selection bucket.
    exclude:
        Optional iterable of names (case-insensitive) to avoid returning.
    """

    normalized = _normalize_code(language_code)
    pool = LANGUAGE_NAME_POOLS.get(normalized, LANGUAGE_NAME_POOLS[DEFAULT_LANGUAGE])
    excluded = _prepare_exclusions(exclude)

    if gender == "male":
        buckets = ("male", "neutral", "female")
    elif gender == "female":
        buckets = ("female", "neutral", "male")
    else:
        buckets = ("neutral", "female", "male")

    name = _pick_from_pool(pool, buckets, excluded)
    if name:
        return name

    if normalized != DEFAULT_LANGUAGE:
        default_pool = LANGUAGE_NAME_POOLS[DEFAULT_LANGUAGE]
        return _pick_from_pool(default_pool, buckets, excluded)
    return None


__all__ = ["choose_random_name"]
