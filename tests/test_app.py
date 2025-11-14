import uuid
import jwt
import pytest
from httpx import AsyncClient

from glass.app import create_app
from glass.config import get_settings


def make_token() -> str:
    settings = get_settings()
    payload = {
        "sub": "user-123",
        "email": "user@example.com",
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


@pytest.mark.anyio("asyncio")
async def test_me_requires_auth():
    app = create_app()
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        response = await client.get("/me")
        assert response.status_code == 401


@pytest.mark.anyio("asyncio")
async def test_me_returns_profile():
    app = create_app()
    token = make_token()
    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        response = await client.get("/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "user@example.com"


@pytest.mark.anyio("asyncio")
async def test_account_registration_and_verification():
    app = create_app()
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    password = "secretpass123"
    payload = {"email": email, "password": password, "name": "Signup Tester"}
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        register = await client.post("/accounts/register", json=payload)
        assert register.status_code == 200
        verify = await client.post(
            "/accounts/verify", json={"email": email, "password": password}
        )
        assert verify.status_code == 200
        data = verify.json()
        assert data["email"] == email
