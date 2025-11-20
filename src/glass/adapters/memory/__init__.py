"""Memory adapter selection utilities."""

from __future__ import annotations

import logging
from typing import Protocol

from .inmemory import InMemoryMemoryAdapter
from .postgres import PostgresMemoryAdapter

LOGGER = logging.getLogger(__name__)


class MemoryAdapter(Protocol):
    async def upsert(self, nodes, edges=None) -> None: ...
    async def retrieve(self, session_id: str, query: str, k: int = 6): ...


def build_memory_adapter(settings, *, database=None, redis_client=None, llm_adapter=None) -> MemoryAdapter:
    provider = getattr(settings, "memory_provider", "postgres").lower()

    if provider == "postgres":
        if database is None:
            raise ValueError("PersistenceDatabase instance is required for Postgres memory adapter.")
        return PostgresMemoryAdapter(
            database=database,
            llm=llm_adapter,
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
