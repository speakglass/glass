"""Memory adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .embedder import MemoryEmbedder
from .inmemory import InMemoryMemoryAdapter
from .postgres import PostgresMemoryAdapter

LOGGER = logging.getLogger(__name__)


class MemoryAdapter(Protocol):
    async def upsert(self, nodes, edges=None) -> None: ...
    async def retrieve(self, session_id: str, query: str, k: int = 6): ...


def build_memory_adapter(settings, *, database=None, redis_client=None, llm_adapter=None) -> MemoryAdapter:
    """Build memory adapter with optional semantic search support.

    Args:
        settings: Application settings
        database: Database instance (required for postgres)
        redis_client: Redis client (unused, kept for backwards compatibility)
        llm_adapter: LLM adapter for memory classification

    Returns:
        Configured memory adapter
    """
    provider = getattr(settings, "memory_provider", "postgres").lower()

    if provider == "postgres":
        if database is None:
            raise ValueError("PersistenceDatabase instance is required for Postgres memory adapter.")

        # Initialize embedder for semantic search if configured
        embedder = None
        embedding_provider = getattr(settings, "embedding_provider", "openai").lower()

        if embedding_provider != "none":
            try:
                # Get API key from settings based on provider
                api_key = None
                if embedding_provider == "openai":
                    api_key = settings.openai_api_key
                elif embedding_provider == "gemini":
                    api_key = settings.gemini_api_key

                embedder = MemoryEmbedder(provider=embedding_provider, api_key=api_key)
                LOGGER.info(
                    f"✅ Memory embedder initialized "
                    f"(provider={embedding_provider}, model={embedder.model}, dim={embedder.dimension})"
                )
            except Exception as e:
                LOGGER.warning(
                    f"⚠️  Failed to initialize embedder (provider={embedding_provider}): {e}. "
                    "Semantic search will be disabled."
                )
        else:
            LOGGER.info("ℹ️  Semantic search disabled (embedding_provider=none)")

        return PostgresMemoryAdapter(
            database=database,
            llm=llm_adapter,
            embedder=embedder,
        )

    if provider == "inmemory":
        return InMemoryMemoryAdapter()  # type: ignore[return-value]

    raise ValueError(f"Unknown memory provider: {provider}")


__all__ = [
    "MemoryAdapter",
    "build_memory_adapter",
    "InMemoryMemoryAdapter",
    "PostgresMemoryAdapter",
]
