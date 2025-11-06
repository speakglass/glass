"""Graphiti memory adapter that forwards nodes and edges to the Graphiti API."""

from __future__ import annotations

import httpx
from typing import Iterable, Sequence


class GraphitiMemoryAdapter:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.graphiti.ai/v1",
        upsert_path: str = "/graph/upsert",
        retrieve_path: str = "/graph/retrieve",
        timeout: float = 10.0,
    ) -> None:
        if not api_key:
            raise ValueError("Graphiti API key is required.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.upsert_path = upsert_path
        self.retrieve_path = retrieve_path
        self.timeout = timeout

    async def upsert(
        self,
        nodes: Iterable[dict],
        edges: Iterable[tuple[str, str, str]] | None = None,
    ) -> None:
        payload = {
            "nodes": list(nodes),
            "edges": [list(edge) for edge in edges] if edges else [],
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post(
                self.upsert_path,
                json=payload,
                headers=self._headers,
            )
            response.raise_for_status()

    async def retrieve(self, session_id: str, query: str, k: int = 6) -> Sequence[dict]:
        payload = {
            "session_id": session_id,
            "query": query,
            "limit": k,
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            response = await client.post(
                self.retrieve_path,
                json=payload,
                headers=self._headers,
            )
            response.raise_for_status()
            data = response.json()
        if isinstance(data, dict):
            results = data.get("results") or data.get("items") or []
        else:
            results = data
        if not isinstance(results, list):
            return []
        return results

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
