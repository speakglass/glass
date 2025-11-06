import pytest

from glass.domain.pipeline import SessionPipeline


class DummyASR:
    async def stream(self, session_id, audio_iter):
        if False:
            yield {}


class DummyMemory:
    def __init__(self) -> None:
        self.nodes = []

    async def upsert(self, nodes, edges=None) -> None:
        self.nodes.extend(nodes)

    async def retrieve(self, session_id, query, k=6):
        return []


class DummyLLM:
    async def suggest(self, transcript_tail, screen, memory, tone, lang):
        return {"text": "suggestion", "notes": [], "tone": tone}


class DummyEvents:
    def __init__(self) -> None:
        self.events = []

    async def send(self, event):
        self.events.append(event)


@pytest.mark.anyio("asyncio")
async def test_pipeline_handle_text_query_emits_suggestion():
    pipeline = SessionPipeline(
        "s1",
        asr=DummyASR(),
        llm=DummyLLM(),
        memory=DummyMemory(),
        events=DummyEvents(),
        vision=None,
    )
    result = await pipeline.handle_text_query("hello world")
    assert result["text"] == "suggestion"
