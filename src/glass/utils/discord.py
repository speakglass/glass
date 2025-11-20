"""Utility helpers for sending Discord webhook notifications."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def send_discord_notification(
    webhook_url: str | None,
    *,
    content: str | None = None,
    embeds: list[dict[str, Any]] | None = None,
    fail_silently: bool = True,
) -> bool:
    """Send a payload to a Discord webhook.

    Returns True on success. When fail_silently is False, exceptions are propagated.
    """
    if not webhook_url:
        logger.debug("Discord notification skipped: webhook missing")
        return False

    payload: dict[str, Any] = {}
    if content:
        payload["content"] = content
    if embeds:
        payload["embeds"] = embeds

    if not payload:
        logger.debug("Discord notification skipped due to empty payload")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:  # pragma: no cover - network failures
        logger.error("Failed to deliver Discord notification: %s", exc)
        if fail_silently:
            return False
        raise

    if resp.status_code >= 300:
        logger.error("Discord webhook rejected payload: %s %s", resp.status_code, resp.text)
        if fail_silently:
            return False
        raise RuntimeError(f"Discord webhook rejected payload: {resp.status_code}")

    return True
