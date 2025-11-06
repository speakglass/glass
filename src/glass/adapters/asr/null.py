"""No-op ASR adapter for development."""

from __future__ import annotations

from typing import AsyncIterable, AsyncIterator


class NullASRAdapter:
    async def stream(
        self,
        session_id: str,
        audio_iter: AsyncIterable[bytes],
        *,
        source: str | None = None,
    ) -> AsyncIterator[dict]:
        async for _chunk in audio_iter:
            continue
        if False:
            yield {}
