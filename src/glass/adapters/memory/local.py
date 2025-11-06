"""In-memory memory adapter for development and tests."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Iterable, Sequence


class InMemoryMemoryAdapter:
    def __init__(self) -> None:
        self._nodes: dict[str, list[dict]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def upsert(
        self,
        nodes: Iterable[dict],
        edges: Iterable[tuple[str, str, str]] | None = None,
    ) -> None:
        async with self._lock:
            for node in nodes:
                session_id = node.get("session_id")
                if not session_id:
                    continue
                self._nodes[session_id].append(dict(node))

    async def retrieve(self, session_id: str, query: str, k: int = 6) -> Sequence[dict]:
        async with self._lock:
            items = list(self._nodes.get(session_id, []))
        if not query:
            return items[-k:]
        lowered = query.lower()
        filtered = [node for node in items if lowered in (node.get("text") or "").lower()]
        return filtered[-k:] if filtered else items[-k:]
