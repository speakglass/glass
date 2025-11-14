"""Memory adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .zep import ZepMemoryAdapter

LOGGER = logging.getLogger(__name__)


class MemoryAdapter(Protocol):
    async def upsert(self, nodes, edges=None) -> None: ...
    async def retrieve(self, session_id: str, query: str, k: int = 6): ...


def build_memory_adapter(settings) -> MemoryAdapter:
    provider = getattr(settings, "memory_provider", "zep").lower()
    
    if provider == "zep":
        api_key = getattr(settings, "zep_api_key", None)
        if not api_key:
            raise ValueError("Zep API key is required.")
        return ZepMemoryAdapter(
            api_key=api_key,
            project_id=getattr(settings, "zep_project_id", None),
        )
    
    raise ValueError(f"Unknown memory provider: {provider}")


__all__ = [
    "MemoryAdapter",
    "build_memory_adapter",
    "ZepMemoryAdapter",
]
