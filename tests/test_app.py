import pytest
from httpx import AsyncClient

from glass.app import create_app


@pytest.mark.anyio("asyncio")
async def test_ask_endpoint_returns_answer():
    app = create_app()
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        response = await client.post("/ask", json={"text": "hello there"})
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["answer"]
