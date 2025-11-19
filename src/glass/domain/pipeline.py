"""Legacy session pipeline shim for compatibility tests."""

from __future__ import annotations

from typing import Any, Sequence


class SessionPipeline:
    """Minimal text-query pipeline used by compatibility tests.

    The production stack relies on ConversationSession; this shim maintains the
    previous interface that downstream tests expect.
    """

    def __init__(
        self,
        session_id: str,
        *,
        asr: Any,
        llm: Any,
        memory: Any,
        events: Any,
    ) -> None:
        self.session_id = session_id
        self.asr = asr
        self.llm = llm
        self.memory = memory
        self.events = events

    async def handle_text_query(
        self,
        text: str,
        *,
        tone: str = "neutral",
        lang: str = "en",
        transcript_tail: Sequence[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Feed a text query through the suggestion LLM."""
        if not transcript_tail:
            transcript_tail = [{"text": text}]
        memory_context = []
        retrieve = getattr(self.memory, "retrieve", None)
        if callable(retrieve):
            try:
                memory_context = await retrieve(self.session_id, query=text, k=6)
            except Exception:
                memory_context = []
        suggest = getattr(self.llm, "suggest", None)
        if not callable(suggest):
            raise RuntimeError("LLM adapter does not provide suggest()")
        suggestion = await suggest(
            transcript_tail=transcript_tail,
            screen=None,
            memory=memory_context,
            tone=tone,
            lang=lang,
        )
        return suggestion or {"text": ""}
