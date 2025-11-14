"""WebSocket routes."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..adapters.websocket import WebSocketEventsAdapter
from ..auth.jwt import AuthenticatedUser, decode_service_token
from ..config import get_settings
from ..utils.audio import iter_multiplexed_audio, iter_websocket_audio
from ..persistence.service import upsert_conversation
from .helpers import derive_conversation_title, generate_conversation_title_with_llm

LOGGER = logging.getLogger(__name__)

router = APIRouter()


def _get_state(websocket: WebSocket):
    return websocket.app.state.app_state


def _client_id_from_ws(websocket: WebSocket, user: AuthenticatedUser | None = None) -> str:
    if user is not None:
        return f"user:{user.user_id}"
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


async def _resolve_ws_user(websocket: WebSocket, token: str | None) -> AuthenticatedUser:
    settings = get_settings()
    if not token:
        await websocket.close(code=4401, reason="authentication required")
        raise WebSocketDisconnect()
    try:
        return decode_service_token(token, settings)
    except HTTPException:
        await websocket.close(code=4401, reason="invalid authentication")
        raise WebSocketDisconnect()


@router.websocket("/ws/audio")
async def audio_stream(
    websocket: WebSocket,
    sid: str,
    auth_token: str | None = Query(default=None, alias="auth_token"),
    source: str = Query(default="mixed"),
    track: str | None = Query(default=None),
    diarize: bool = Query(default=False),
    events: bool = Query(default=True),
) -> None:
    # Minimal origin check before accepting
    origin = websocket.headers.get("origin")
    if not _is_origin_allowed(origin):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    app_state = _get_state(websocket)
    user = await _resolve_ws_user(websocket, auth_token)
    client_id = _client_id_from_ws(websocket, user)
    await app_state.set_session_owner(sid, user.user_id)
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
    finally:
        # Auto-save conversation when WebSocket disconnects
        if user and pipeline.full_conversation:
            asyncio.create_task(_auto_save_conversation(websocket.app, sid, user, pipeline))


@router.websocket("/ws/audio-multi")
async def audio_stream_multiplexed(
    websocket: WebSocket,
    sid: str,
    auth_token: str | None = Query(default=None, alias="auth_token"),
    mic_diarize: bool = Query(default=False),
    system_diarize: bool = Query(default=False),
    events: bool = Query(default=True),
    learning_lang: str = Query(default="en"),
    native_lang: str = Query(default="ko"),
    mode: str = Query(default="real"),
    scenario: str | None = Query(default=None),
) -> None:
    """Multiplexed audio: 0x01=mic, 0x02=system."""
    origin = websocket.headers.get("origin")
    if not _is_origin_allowed(origin):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    app_state = _get_state(websocket)
    user = await _resolve_ws_user(websocket, auth_token)
    client_id = _client_id_from_ws(websocket, user)
    if user:
        await app_state.set_session_owner(sid, user.user_id)
    # Async budget init for multiplexed as well
    if app_state.settings.free_minutes_per_user is not None:
        asyncio.create_task(_init_budget_and_schedule_close(websocket, app_state, client_id))
    events_adapter = WebSocketEventsAdapter(websocket) if events else None
    pipeline = await app_state.session_manager.get_or_create(sid, events_port=events_adapter)
    
    # Set user_id and memory adapter in LLM processor (enables Zep tool calls in LLM)
    pipeline.llm_processor.set_user_id(user.user_id)
    pipeline.llm_processor.set_memory_adapter(pipeline.memory)
    
    # Ensure user and thread exist in Zep (required for memory to work)
    # Must await to ensure thread exists before messages are added
    # Include user's name for better graph construction (Zep best practice)
    if user.name:
        name_parts = user.name.split()
        first_name = name_parts[0]
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else None
    else:
        first_name = None
        last_name = None
    
    await pipeline.memory.ensure_user(
        user_id=user.user_id, 
        email=user.email,
        first_name=first_name,
        last_name=last_name,
    )
    
    # Warm the user's cache for faster context retrieval
    # Per Zep best practices: Do this when user starts a session
    try:
        await pipeline.memory.client.user.warm(user_id=user.user_id)
        LOGGER.info(f"Warmed Zep cache for user {user.user_id}")
    except Exception as e:
        LOGGER.warning(f"Failed to warm Zep cache: {e}")
    
    await pipeline.memory.ensure_thread(thread_id=sid, user_id=user.user_id)
    
    # Load user context once at session start (important facts, preferences, history)
    # This context will be reused throughout the session for all LLM calls
    await pipeline.llm_processor.load_user_context(session_id=sid, user_id=user.user_id)
    
    # Set initial configuration (languages, mode, and scenario) before starting ASR streams
    # Ensures first greeting uses the selected scenario immediately at connect
    try:
        pipeline.set_session_config(learning_lang, native_lang, mode, scenario)
        # Trigger initial AI response once at connect (practice mode)
        if mode == "practice":
            async def generate_initial_response():
                try:
                    from ..domain.entities import EventType
                    await pipeline.llm_processor.emit_ai_response(
                        text="[START]",
                        utterance_id="initial",
                        tail=list(pipeline.tail),
                        event_type_transcript=EventType.TRANSCRIPT,
                        event_type_translation=EventType.TRANSLATION,
                        event_type_suggestion=EventType.SUGGESTION,
                        user_message_end_time=None,
                    )
                except Exception as e:
                    LOGGER.error(f"Failed to generate initial AI response: {e}")
            asyncio.create_task(generate_initial_response())
    except Exception:
        # Fallback to simple assignment if setter not available
        pipeline.learning_lang = learning_lang
        pipeline.native_lang = native_lang
        pipeline.mode = mode
        try:
            pipeline.scenario = scenario  # type: ignore[attr-defined]
        except Exception:
            pass
    LOGGER.info(f"WebSocket connected with learning_lang={learning_lang}, native_lang={native_lang}, mode={mode}, scenario={scenario}, user_id={user.user_id}")
    
    mic_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=8)
    system_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=8)
    source_queues = {"mic": mic_queue, "system": system_queue}
    
    LOGGER.debug(f"Starting multiplexed audio streams for session {sid}")
    mic_task = asyncio.create_task(
        pipeline.process_audio_stream(_queue_to_iter(mic_queue), source="mic")
    )
    system_task = asyncio.create_task(
        pipeline.process_audio_stream(_queue_to_iter(system_queue), source="system")
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
    finally:
        # Auto-save conversation when WebSocket disconnects
        if user and pipeline.full_conversation:
            asyncio.create_task(_auto_save_conversation(websocket.app, sid, user, pipeline))


async def _queue_to_iter(queue: asyncio.Queue):
    """Convert asyncio.Queue to async iterator."""
    while True:
        item = await queue.get()
        if item is None:
            break
        yield item


@router.websocket("/ws/session")
async def session_events(
    websocket: WebSocket,
    sid: str,
    auth_token: str | None = Query(default=None, alias="auth_token"),
) -> None:
    origin = websocket.headers.get("origin")
    if not _is_origin_allowed(origin):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        await _resolve_ws_user(websocket, auth_token)
    except WebSocketDisconnect:
        return
    try:
        await websocket.send_json({"t": "session_ready", "sid": sid})
        while True:
            data = await websocket.receive_text()
            if data == "close":
                break
    except WebSocketDisconnect:
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


async def _auto_save_conversation(app, session_id: str, user: AuthenticatedUser, pipeline) -> None:
    """Automatically analyze and save conversation when WebSocket disconnects."""
    try:
        user_id = user.user_id
        LOGGER.info(f"[AutoSave] Starting auto-save for session {session_id}")
        
        # Collect messages with translations and timing (local operation, fast)
        messages = []
        for msg in pipeline.full_conversation:
            message_dict: dict[str, Any] = {
                "speaker": msg.get("speaker", "unknown"),
                "source": msg.get("source", "unknown"),
                "text": msg.get("text", ""),
            }
            if "utterance_id" in msg:
                message_dict["utterance_id"] = msg["utterance_id"]
            # Include timing information for accurate temporal understanding in Zep
            if "start" in msg:
                message_dict["start"] = msg["start"]
            if "duration" in msg:
                message_dict["duration"] = msg["duration"]
            utterance_id = msg.get("utterance_id")
            if utterance_id and utterance_id in pipeline.llm_processor._translations:
                message_dict["translation"] = pipeline.llm_processor._translations[utterance_id]
            messages.append(message_dict)
        
        # Calculate timestamps
        started_epoch = getattr(pipeline, "session_start_time", None)
        started_at = (
            datetime.fromtimestamp(started_epoch, tz=timezone.utc)
            if isinstance(started_epoch, (int, float)) and started_epoch > 0
            else None
        )
        ended_at = datetime.now(timezone.utc)
        duration_seconds = (
            max(0, int((ended_at - started_at).total_seconds())) if started_at else None
        )
        
        # Run analysis and title generation in parallel
        native_lang = getattr(pipeline.llm_processor, "native_lang", None)
        llm_adapter = getattr(pipeline.llm_processor, "llm", None)
        
        analysis_task = asyncio.create_task(pipeline.analyze_conversation())
        title_task = asyncio.create_task(generate_conversation_title_with_llm(
            llm_adapter,
            messages,
            native_lang,
        ))
        
        # Wait for both to complete
        results_tuple = await asyncio.gather(analysis_task, title_task, return_exceptions=True)
        analysis_result: dict[str, Any] | BaseException = results_tuple[0]  # type: ignore[assignment]
        title_result: str | BaseException = results_tuple[1]  # type: ignore[assignment]
        
        # Handle exceptions
        analysis: dict[str, Any]
        if isinstance(analysis_result, BaseException):
            LOGGER.error(f"[AutoSave] Analysis failed: {analysis_result}")
            analysis = {
                "scores": {"fluency": 0, "accuracy": 0, "comprehensibility": 0},
                "feedback": "Analysis failed",
            }
        else:
            analysis = analysis_result
        
        title: str
        if isinstance(title_result, BaseException) or not title_result:
            LOGGER.warning("[AutoSave] Title generation failed, using fallback")
            # Fallback to date-based title (extracted_info is now handled by Zep)
            title = derive_conversation_title(None, started_at)
        else:
            title = title_result
        
        # Save to database
        # Note: Memory extraction is now handled by Zep (no extracted_info field)
        db = app.state.history_store
        await upsert_conversation(
            db,
            user_id=user_id,
            session_id=session_id,
            title=title,
            summary=analysis.get("feedback"),
            feedback=analysis.get("feedback"),
            scores=analysis.get("scores"),
            messages=messages,
            learning_lang=getattr(pipeline.llm_processor, "learning_lang", None),
            native_lang=getattr(pipeline.llm_processor, "native_lang", None),
            started_at=started_at or ended_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
        )
        
        # Add conversation messages to Zep thread (REQUIRED for memory)
        # Zep will automatically extract facts, entities, and build knowledge graph
        # Include user name and timestamps for better graph construction (Zep best practice)
        try:
            await pipeline.memory.add_conversation_messages(
                thread_id=session_id,
                user_id=user_id,
                messages=messages,
                user_name=user.name,
                session_start_time=started_epoch,
            )
            LOGGER.info(f"[AutoSave] Added {len(messages)} messages to Zep thread {session_id}")
            LOGGER.info("[AutoSave] Zep will automatically extract facts and entities from these messages")
        except Exception as e:
            LOGGER.error(f"[AutoSave] Failed to add messages to Zep thread: {e}", exc_info=True)
        
        # Note: Automatic Zep → PostgreSQL sync is intentionally NOT done here
        # Reasons:
        # 1. Zep processes asynchronously (can't reliably wait for it)
        # 2. Would create stale duplicates of Zep's data
        # 3. Adds latency to conversation save
        # 
        # Instead: Users manually sync from Memory page when needed
        # - View live Zep facts via API (?include_zep_facts=true)
        # - Pin important facts to DB for editing
        
        # Clear session owner
        await app.state.app_state.clear_session_owner(session_id)
        
        LOGGER.info(f"[AutoSave] Successfully saved conversation for session {session_id}")
    except Exception as e:
        LOGGER.exception(f"[AutoSave] Failed to auto-save conversation for session {session_id}: {e}")
