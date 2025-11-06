"""Memory adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .graphiti import GraphitiMemoryAdapter
from .local import InMemoryMemoryAdapter

LOGGER = logging.getLogger(__name__)


class MemoryAdapter(Protocol):
    async def upsert(self, nodes, edges=None) -> None: ...
    async def retrieve(self, session_id: str, query: str, k: int = 6): ...


def build_memory_adapter(settings) -> MemoryAdapter:
    provider = (getattr(settings, "memory_provider", None) or "local").lower()
    try:
        if provider in {"graphiti", "graph"}:
            api_key = getattr(settings, "graphiti_key", None)
            if not api_key:
                raise ValueError("Graphiti API key is required.")
            return GraphitiMemoryAdapter(
                api_key=api_key,
                base_url=getattr(settings, "graphiti_base_url", "https://api.graphiti.ai/v1"),
                upsert_path=getattr(settings, "graphiti_upsert_path", "/graph/upsert"),
                retrieve_path=getattr(settings, "graphiti_retrieve_path", "/graph/retrieve"),
                timeout=getattr(settings, "graphiti_timeout", 10.0),
            )
    except ValueError as exc:
        LOGGER.warning("Falling back to in-memory adapter: %s", exc)
    return InMemoryMemoryAdapter()


__all__ = [
    "MemoryAdapter",
    "build_memory_adapter",
    "GraphitiMemoryAdapter",
    "InMemoryMemoryAdapter",
]
