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


def _is_origin_allowed(origin: str | None) -> bool:
    """Check Origin against GLASS_ALLOW_ORIGIN, supporting comma-separated values and wildcard.

    Mirrors the logic used in HTTP CORS setup so WS behaves consistently.
    """
    settings = get_settings()
    # Build list from comma-separated env string
    items = [part.strip() for part in (settings.allow_origin or "").split(",")]
    allow_list = [item for item in items if item]
    # Wildcard or empty means allow all
    if not allow_list or "*" in allow_list:
        return True
    return origin in allow_list


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
    if not _is_origin_allowed(origin):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    app_state = _get_state(websocket)
    client_id = _client_id_from_ws(websocket)
    events_adapter = WebSocketEventsAdapter(websocket) if events else None
    pipeline = await app_state.session_manager.get_or_create(sid, events_port=events_adapter)
    audio_iter = iter_websocket_audio(websocket)
    # Enforce per-client time budget
    if app_state.settings.free_minutes_per_user is not None:
        asyncio.create_task(_init_budget_and_schedule_close(websocket, app_state, client_id))
    try:
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
    scenario: str | None = Query(default=None),
) -> None:
    """Multiplexed audio: 0x01=mic, 0x02=system."""
    settings = get_settings()
    origin = websocket.headers.get("origin")
    if not _is_origin_allowed(origin):
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
    
    # Set initial configuration (languages, mode, and scenario) before starting ASR streams
    # Ensures first greeting uses the selected scenario immediately at connect
    try:
        pipeline.set_session_config(learning_lang, native_lang, mode, scenario)
        # Trigger initial greeting once at connect (practice mode)
        if mode == "practice":
            asyncio.create_task(pipeline._generate_initial_greeting())
    except Exception:
        # Fallback to simple assignment if setter not available
        pipeline.learning_lang = learning_lang
        pipeline.native_lang = native_lang
        pipeline.mode = mode
        try:
            pipeline.scenario = scenario  # type: ignore[attr-defined]
        except Exception:
            pass
    LOGGER.info(f"WebSocket connected with learning_lang={learning_lang}, native_lang={native_lang}, mode={mode}, scenario={scenario}")
    
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
    if not _is_origin_allowed(origin):
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
    """Initialize daily cumulative quota and start usage metering loop."""
    settings = get_settings()
    total_sec = int(settings.free_minutes_per_user or 0) * 60
    
    try:
        # Fetch remaining quota from Redis with timeout handling
        remaining_sec = await asyncio.wait_for(
            app_state.get_remaining_seconds_quota(client_id),
            timeout=10.0  # Don't block connection start too long
        )
        LOGGER.info(f"[Budget] Client {client_id}: {remaining_sec}s remaining of {total_sec}s")
    except asyncio.TimeoutError:
        LOGGER.warning(f"[Budget] Redis timeout on init for {client_id}, allowing connection")
        remaining_sec = total_sec  # Fail open: allow connection if Redis is down
    except Exception as e:
        LOGGER.exception(f"[Budget] Failed to check quota for {client_id}: {e}")
        remaining_sec = total_sec  # Fail open
    
    # Block if quota exhausted
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
    
    # Send time info to client
    try:
        await websocket.send_json({"t": "time_remaining", "seconds": int(remaining_sec), "total": total_sec})
        LOGGER.info(f"[Budget] Sent time_remaining to client {client_id}: {remaining_sec}s")
    except Exception as e:
        LOGGER.warning(f"[Budget] Failed to send time_remaining: {e}")
    
    # Start usage tracking
    asyncio.create_task(_usage_meter_loop(websocket, app_state, client_id, total_sec))

async def _usage_meter_loop(websocket: WebSocket, app_state, client_id: str, total_sec: int) -> None:
    """Track usage locally; sync + check quota every 5 minutes for robustness.
    
    Balance between efficiency and robustness:
    - Periodic sync handles multi-connection abuse and server crashes
    - 5-minute interval keeps Redis load low while preventing quota bypass
    """
    sync_interval = 300  # 5 minutes - good balance
    start_time = asyncio.get_event_loop().time()
    last_sync = 0
    
    try:
        while True:
            await asyncio.sleep(sync_interval)
            elapsed = int(asyncio.get_event_loop().time() - start_time)
            seconds_to_sync = elapsed - last_sync
            
            # Sync accumulated time to Redis
            if seconds_to_sync > 0:
                total_used = await app_state.incr_used_seconds(client_id, seconds_to_sync)
                last_sync = elapsed
                LOGGER.debug(f"[Budget] Synced {seconds_to_sync}s for client {client_id} (total today: {total_used}s)")
                
                # Check if quota exceeded (handles multi-connection case)
                if total_used >= total_sec:
                    try:
                        await websocket.send_json({"t": "limit_reached", "reason": "time", "max": total_sec})
                    except Exception:
                        pass
                    try:
                        await websocket.close(code=1000)
                    except Exception:
                        pass
                    return
    finally:
        # Sync any remaining time on disconnect (handles clean shutdown or crash recovery)
        elapsed = int(asyncio.get_event_loop().time() - start_time)
        remaining = elapsed - last_sync
        if remaining > 0:
            try:
                await app_state.incr_used_seconds(client_id, remaining)
                LOGGER.info(f"[Budget] Final sync: {remaining}s for client {client_id} on disconnect")
            except Exception as e:
                LOGGER.warning(f"[Budget] Failed to sync on disconnect: {e}")

 
