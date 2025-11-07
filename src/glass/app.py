"""FastAPI application factory."""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .api.http_routes import router as http_router
from .api.ws_routes import router as ws_router
from .app_state import AppState, build_app_state
from .config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    # Ensure root logger prints our module logs (uvicorn config only covers its own loggers)
    level_name = (settings.log_level or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s"))
        root.addHandler(handler)
    root.setLevel(level)
    app = FastAPI(title="Glass API", version="0.1.0")
    app.state.app_state = build_app_state(settings)

    # Build CORS allow_origins list from GLASS_ALLOW_ORIGIN (supports comma-separated)
    items = [part.strip() for part in (settings.allow_origin or "").split(",")]
    items = [item for item in items if item]
    if not items or "*" in items:
        allow_origins = ["*"]
    else:
        allow_origins = items

    # Only allow credentials when not using wildcard
    allow_credentials = settings.allow_credentials and not (len(allow_origins) == 1 and allow_origins[0] == "*")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(http_router)
    app.include_router(ws_router)

    logger = logging.getLogger("glass.http")

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # pragma: no cover - logging only
            logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        status = response.status_code

        if status >= 400:
            origin = request.headers.get("origin")
            if request.method == "OPTIONS":
                logger.warning(
                    "Preflight failed: %s %s -> %s (origin=%s, %.2f ms)",
                    request.method,
                    request.url.path,
                    status,
                    origin,
                    elapsed_ms,
                )
            else:
                logger.warning(
                    "HTTP %s %s -> %s (%.2f ms)",
                    request.method,
                    request.url.path,
                    status,
                    elapsed_ms,
                )
        else:
            logger.debug(
                "HTTP %s %s -> %s (%.2f ms)",
                request.method,
                request.url.path,
                status,
                elapsed_ms,
            )
        return response

    return app


def get_app_state(app: FastAPI) -> AppState:
    return app.state.app_state
