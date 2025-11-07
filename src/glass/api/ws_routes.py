"""WebSocket routes."""

from __future__ import annotations

import asyncio
import logging
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..adapters.events_ws import WebSocketEventsAdapter
from ..config import get_settings
from ..utils.audio import iter_websocket_audio, iter_multiplexed_audio

LOGGER = logging.getLogger(__name__)

router = APIRouter()


def _get_state(websocket: WebSocket):
    return websocket.app.state.app_state


def _client_id_from_ws(websocket: WebSocket) -> str:
    # Prefer X-Forwarded-For first value, else peer IP
    xff = websocket.headers.get("x-forwarded-for") or websocket.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    client = getattr(websocket, "client", None)
    return getattr(client, "host", "unknown")


@router.websocket("/ws/audio")
async def audio_stream(
    websocket: WebSocket,
    sid: str,
    source: str = Query(default="mixed"),
    track: str | None = Query(default=None),
    diarize: bool = Query(default=False),
    events: bool = Query(default=True),
) -> None:
    # Minimal origin check before accepting
    settings = get_settings()
    origin = websocket.headers.get("origin")
    allowed = settings.allow_origin
    if allowed != "*" and origin != allowed:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    app_state = _get_state(websocket)
    client_id = _client_id_from_ws(websocket)
    events_adapter = WebSocketEventsAdapter(websocket) if events else None
    pipeline = await app_state.session_manager.get_or_create(sid, events_port=events_adapter)
    # Force conversation length limit by closing when cap is reached
    if settings.max_full_conversation is not None and int(settings.max_full_conversation or 0) > 0:
        asyncio.create_task(_enforce_conversation_cap(websocket, pipeline, int(settings.max_full_conversation)))
    audio_iter = iter_websocket_audio(websocket)
    # Enforce per-client time budget using deadline-based approach (async init)
    if app_state.settings.free_minutes_per_user is not None:
        asyncio.create_task(_init_budget_and_schedule_close(websocket, app_state, client_id))
    try:
        # Enforce session TTL
        asyncio.create_task(_close_after_ttl(websocket, settings.ws_max_session_seconds))
        stream_label = track or source
        await pipeline.process_audio_stream(
            audio_iter,
            source=stream_label,
            enable_diarization=diarize,
        )
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/audio-multi")
async def audio_stream_multiplexed(
    websocket: WebSocket,
    sid: str,
    mic_diarize: bool = Query(default=False),
    system_diarize: bool = Query(default=False),
    events: bool = Query(default=True),
    learning_lang: str = Query(default="en"),
    native_lang: str = Query(default="ko"),
    mode: str = Query(default="real"),
) -> None:
    """Multiplexed audio: 0x01=mic, 0x02=system."""
    settings = get_settings()
    origin = websocket.headers.get("origin")
    allowed = settings.allow_origin
    if allowed != "*" and origin != allowed:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    app_state = _get_state(websocket)
    client_id = _client_id_from_ws(websocket)
    # Async budget init for multiplexed as well
    if app_state.settings.free_minutes_per_user is not None:
        asyncio.create_task(_init_budget_and_schedule_close(websocket, app_state, client_id))
    events_adapter = WebSocketEventsAdapter(websocket) if events else None
    pipeline = await app_state.session_manager.get_or_create(sid, events_port=events_adapter)
    if settings.max_full_conversation is not None and int(settings.max_full_conversation or 0) > 0:
        asyncio.create_task(_enforce_conversation_cap(websocket, pipeline, int(settings.max_full_conversation)))
    
    # Set initial language configuration before starting ASR streams
    # Ensure ASR picks up correct Deepgram language/model from the outset
    try:
        pipeline.set_session_config(learning_lang, native_lang, mode, None)
        # Trigger initial greeting once at connect (practice mode)
        if mode == "practice":
            asyncio.create_task(pipeline._generate_initial_greeting())
    except Exception:
        # Fallback to simple assignment if setter not available
        pipeline.learning_lang = learning_lang
        pipeline.native_lang = native_lang
        pipeline.mode = mode
    LOGGER.info(f"WebSocket connected with learning_lang={learning_lang}, native_lang={native_lang}, mode={mode}")
    
    mic_queue = asyncio.Queue(maxsize=8)
    system_queue = asyncio.Queue(maxsize=8)
    source_queues = {"mic": mic_queue, "system": system_queue}
    
    LOGGER.debug(f"Starting multiplexed audio streams for session {sid}")
    mic_task = asyncio.create_task(
        pipeline.process_audio_stream(_queue_to_iter(mic_queue), source="mic", enable_diarization=mic_diarize)
    )
    system_task = asyncio.create_task(
        pipeline.process_audio_stream(_queue_to_iter(system_queue), source="system", enable_diarization=system_diarize)
    )
    
    try:
        # Enforce session TTL
        asyncio.create_task(_close_after_ttl(websocket, settings.ws_max_session_seconds))
        await iter_multiplexed_audio(websocket, source_queues, pipeline)
        await asyncio.gather(mic_task, system_task)
    except WebSocketDisconnect:
        mic_task.cancel()
        system_task.cancel()
    except Exception:
        mic_task.cancel()
        system_task.cancel()
        raise


async def _queue_to_iter(queue: asyncio.Queue):
    """Convert asyncio.Queue to async iterator."""
    while True:
        item = await queue.get()
        if item is None:
            break
        yield item


@router.websocket("/ws/session")
async def session_events(websocket: WebSocket, sid: str) -> None:
    settings = get_settings()
    origin = websocket.headers.get("origin")
    allowed = settings.allow_origin
    if allowed != "*" and origin != allowed:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        await websocket.send_json({"t": "session_ready", "sid": sid})
        while True:
            data = await websocket.receive_text()
            if data == "close":
                break
    except WebSocketDisconnect:
        return


async def _close_after_ttl(websocket: WebSocket, ttl_seconds: int) -> None:
    try:
        await asyncio.sleep(max(1, ttl_seconds))
        # Close with normal closure if still open; suppress if already closed
        await websocket.close()
    except Exception:
        pass


async def _enforce_time_budget(websocket: WebSocket, app_state, client_id: str) -> None:
    """Deprecated: kept for compatibility; not used in deadline-based mode."""
    try:
        remaining = await app_state.get_remaining_seconds_deadline(client_id)
        total = int(app_state.settings.free_minutes_per_user or 0) * 60
        if remaining > 0:
            await websocket.send_json({"t": "time_remaining", "seconds": int(remaining), "total": total})
            await asyncio.sleep(int(remaining))
        await websocket.send_json({"t": "limit_reached", "reason": "time", "max": total})
        await websocket.close(code=1000)
    except Exception:
        LOGGER.exception("[Budget] enforce (legacy) error client=%s", client_id)
        return


async def _monitor_time_budget(websocket: WebSocket, app_state, client_id: str) -> None:
    """Deprecated passive monitor (not used in deadline mode)."""
    try:
        remaining = await app_state.get_remaining_seconds_deadline(client_id)
        total = int(app_state.settings.free_minutes_per_user or 0) * 60
        if remaining > 0:
            await asyncio.sleep(int(remaining))
        await websocket.send_json({"t": "limit_reached", "reason": "time", "max": total})
        await websocket.close(code=1000)
    except Exception:
        LOGGER.exception("[Budget] monitor (legacy) error client=%s", client_id)
        return

async def _close_when_deadline(websocket: WebSocket, remaining_sec: int, total_sec: int) -> None:
    """Sleep until deadline then close this websocket with limit event."""
    try:
        await asyncio.sleep(max(0, int(remaining_sec)))
        try:
            await websocket.send_json({"t": "limit_reached", "reason": "time", "max": total_sec})
        except Exception:
            pass
        try:
            await websocket.close(code=1000)
        except Exception:
            pass
    except Exception:
        LOGGER.exception("[Budget] close_when_deadline error")
        return


async def _init_budget_and_schedule_close(websocket: WebSocket, app_state, client_id: str) -> None:
    """Initialize budget asynchronously, send initial time, and schedule close at deadline."""
    try:
        settings = get_settings()
        remaining_sec = await app_state.get_remaining_seconds_deadline(client_id)
        total_sec = int(settings.free_minutes_per_user or 0) * 60
        # Keep quiet here; failures are logged below
        if remaining_sec <= 0:
            try:
                await websocket.send_json({"t": "limit_reached", "reason": "time", "max": total_sec})
            except Exception:
                pass
            try:
                await websocket.close(code=1013)
            except Exception:
                pass
            return
        try:
            await websocket.send_json({"t": "time_remaining", "seconds": int(remaining_sec), "total": total_sec})
        except Exception:
            pass
        asyncio.create_task(_close_when_deadline(websocket, int(remaining_sec), total_sec))
    except Exception as e:
        LOGGER.exception("[Budget]/ws/init failed: %s", e)

async def _enforce_conversation_cap(websocket: WebSocket, pipeline, cap: int) -> None:
    try:
        # Poll every 300ms; when cap reached, notify and close
        while True:
            await asyncio.sleep(0.3)
            if len(getattr(pipeline, "full_conversation", [])) >= cap:
                try:
                    await websocket.send_json({"t": "limit_reached", "reason": "conversation", "max": cap})
                except Exception:
                    pass
                try:
                    await websocket.close(code=1000)
                except Exception:
                    pass
                return
    except Exception:
        return
