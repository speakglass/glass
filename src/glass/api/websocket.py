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
from ..persistence.service import (
    upsert_conversation,
    get_partner_by_id,
    ensure_live_session_partner,
    update_partner_details,
)
from .helpers import (
    derive_conversation_title,
    generate_conversation_title_with_llm,
    extract_partner_profile_with_llm,
)

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


def _partner_to_profile(partner) -> dict[str, Any]:
    return {
        "id": partner.id,
        "name": partner.name,
        "description": partner.description,
        "avatar_url": partner.avatar_url,
        "voice_id": partner.voice_id,
        "learning_lang": partner.learning_lang,
        "native_lang": partner.native_lang,
        "is_system": partner.user_id is None,
    }


def _build_participants(snapshot: dict[str, Any] | None, user: AuthenticatedUser | None) -> dict[str, dict[str, Any]]:
    participants: dict[str, dict[str, Any]] = {
        "glass": {"id": "glass", "name": "Glass"},
    }
    user_entry = (snapshot or {}).get("user") or {}
    user_id = user_entry.get("id") or (user.user_id if user else None)
    participants["user"] = {
        "id": (str(user_id).lower() if isinstance(user_id, str) else user_id),
        "name": user_entry.get("name") or (user.name if user and user.name else "You"),
    }
    partner_entry = (snapshot or {}).get("partner")
    if partner_entry:
        partner_id = str(partner_entry.get("id") or "").lower()
        partner_profile = {
            "id": partner_id or None,
            "name": partner_entry.get("name") or "Partner",
        }
        if partner_id:
            participants[partner_id] = partner_profile
        participants.setdefault("partner", partner_profile)
    else:
        participants.setdefault("partner", {"name": "Partner"})
    return participants


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
    # Enforce per-client daily quota
    if app_state.settings.daily_free_minutes is not None:
        asyncio.create_task(_init_quota_and_schedule_close(websocket, app_state, client_id, user))
    try:
        stream_label = track or source
        await pipeline.process_audio_stream(
            audio_iter,
            source=stream_label,
        )
    except WebSocketDisconnect:
        pass
    finally:
        # Auto-save conversation when WebSocket disconnects
        if user and pipeline.memory.get_full_conversation():
            asyncio.create_task(_auto_save_conversation(websocket.app, sid, user, pipeline))


@router.websocket("/ws/audio-multi")
async def audio_stream_multiplexed(
    websocket: WebSocket,
    sid: str,
    auth_token: str | None = Query(default=None, alias="auth_token"),
    events: bool = Query(default=True),
    learning_lang: str = Query(default="en"),
    native_lang: str = Query(default="ko"),
    mode: str = Query(default="live_call"),
    partner_id: str | None = Query(default=None),
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
    history_store = getattr(websocket.app.state, "history_store", None)
    partner_profile: dict[str, Any] | None = None
    if partner_id and user and history_store:
        partner_model = await get_partner_by_id(history_store, partner_id, user_id=user.user_id)
        if partner_model:
            partner_profile = _partner_to_profile(partner_model)
        else:
            LOGGER.warning(f"[Roleplay] Partner {partner_id} not found for user {user.user_id}")
    elif mode == "live_call" and history_store and user:
        placeholder_partner = await ensure_live_session_partner(
            history_store,
            user_id=user.user_id,
            session_id=sid,
            learning_lang=learning_lang,
            native_lang=native_lang,
        )
        partner_profile = _partner_to_profile(placeholder_partner)
        partner_id = placeholder_partner.id
    # Async quota init for multiplexed as well
    if app_state.settings.daily_free_minutes is not None:
        asyncio.create_task(_init_quota_and_schedule_close(websocket, app_state, client_id, user))
    events_adapter = WebSocketEventsAdapter(websocket) if events else None
    pipeline = await app_state.session_manager.get_or_create(sid, events_port=events_adapter)
    
    # Initialize session for user (handles all setup including memory, config, and initial greeting)
    await pipeline.initialize_for_user(
        user_id=user.user_id, 
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        learning_lang=learning_lang,
        native_lang=native_lang,
        mode=mode,
        partner=partner_profile,
    )
    
    LOGGER.info(
        f"WebSocket connected with learning_lang={learning_lang}, native_lang={native_lang}, "
        f"mode={mode}, partner_id={partner_id}, user_id={user.user_id}"
    )
    
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
        await iter_multiplexed_audio(
            websocket,
            source_queues,
            pipeline,
            db=history_store,
            user=user,
        )
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
        if user and pipeline.memory.get_full_conversation():
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


async def _init_quota_and_schedule_close(
    websocket: WebSocket, 
    app_state, 
    client_id: str,
    user: AuthenticatedUser | None = None
) -> None:
    """Initialize daily cumulative quota and start usage metering loop."""
    from ..persistence.service import get_user_by_id
    
    settings = get_settings()
    daily_total_sec = int(settings.daily_free_minutes or 0) * 60
    
    # Get user's bonus minutes if authenticated
    bonus_minutes = None
    if user:
        try:
            history_store = getattr(websocket.app.state, "history_store", None)
            if history_store:
                account_user = await get_user_by_id(history_store, user.user_id)
                if account_user and account_user.bonus_minutes:
                    bonus_minutes = account_user.bonus_minutes
                    LOGGER.info(f"[Quota] User {user.user_id} has {bonus_minutes} bonus minutes")
            else:
                LOGGER.debug("[Quota] history_store missing on app state; cannot fetch bonus minutes")
        except Exception as e:
            LOGGER.warning(f"[Quota] Failed to fetch bonus_minutes for user {user.user_id if user else 'unknown'}: {e}")
    
    try:
        # Fetch remaining quota from Redis with timeout handling
        remaining_sec = await asyncio.wait_for(
            app_state.get_remaining_seconds_quota(client_id, bonus_minutes=bonus_minutes),
            timeout=10.0  # Don't block connection start too long
        )
        LOGGER.info(f"[Quota] Client {client_id}: {remaining_sec}s remaining (daily: {daily_total_sec}s, bonus: {bonus_minutes or 0}min)")
    except asyncio.TimeoutError:
        LOGGER.warning(f"[Quota] Redis timeout on init for {client_id}, allowing connection")
        remaining_sec = daily_total_sec  # Fail open: allow connection if Redis is down
    except Exception as e:
        LOGGER.exception(f"[Quota] Failed to check quota for {client_id}: {e}")
        remaining_sec = daily_total_sec  # Fail open
    
    # Block if quota exhausted
    if remaining_sec <= 0:
        try:
            await websocket.send_json({"t": "limit_reached", "reason": "time", "max": daily_total_sec})
        except Exception:
            pass
        try:
            await websocket.close(code=1013)
        except Exception:
            pass
        return
    
    # Send time info to client
    try:
        await websocket.send_json({"t": "time_remaining", "seconds": int(remaining_sec), "total": daily_total_sec})
        LOGGER.info(f"[Quota] Sent time_remaining to client {client_id}: {remaining_sec}s")
    except Exception as e:
        LOGGER.warning(f"[Quota] Failed to send time_remaining: {e}")
    
    # Start usage tracking
    asyncio.create_task(_usage_meter_loop(websocket, app_state, client_id, daily_total_sec, bonus_minutes))

async def _usage_meter_loop(
    websocket: WebSocket, 
    app_state, 
    client_id: str, 
    daily_total_sec: int,
    bonus_minutes: int | None = None
) -> None:
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
                LOGGER.debug(f"[Quota] Synced {seconds_to_sync}s for client {client_id} (total today: {total_used}s)")
                
                # Check if quota exceeded (handles multi-connection case)
                # This uses the actual get_remaining_seconds_quota to check bonus too
                remaining = await app_state.get_remaining_seconds_quota(client_id, bonus_minutes=bonus_minutes)
                if remaining <= 0:
                    try:
                        await websocket.send_json({"t": "limit_reached", "reason": "time", "max": daily_total_sec})
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
                LOGGER.info(f"[Quota] Final sync: {remaining}s for client {client_id} on disconnect")
            except Exception as e:
                LOGGER.warning(f"[Budget] Failed to sync on disconnect: {e}")


async def _auto_save_conversation(app, session_id: str, user: AuthenticatedUser, pipeline) -> None:
    """Automatically analyze and save conversation when WebSocket disconnects."""
    session_manager = getattr(app.state.app_state, "session_manager", None)
    try:
        user_id = user.user_id
        LOGGER.info(f"[AutoSave] Starting auto-save for session {session_id}")
        
        # Collect messages with translations and timing (local operation, fast)
        messages = []
        for msg in pipeline.memory.get_full_conversation():
            message_dict: dict[str, Any] = {}
            for key in (
                "role",
                "partner_id",
                "text",
                "utterance_id",
                "start",
                "duration",
                "event_type",
                "translation",
            ):
                if key in msg and msg[key] is not None:
                    message_dict[key] = msg[key]
            utterance_id = msg.get("utterance_id")
            if utterance_id:
                if utterance_id in pipeline.assistant._translations:
                    message_dict["translation"] = pipeline.assistant._translations[utterance_id]
                elif hasattr(pipeline, "roleplay") and utterance_id in getattr(pipeline.roleplay, "_translations", {}):
                    message_dict["translation"] = pipeline.roleplay._translations[utterance_id]
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
        native_lang = getattr(pipeline.assistant, "native_lang", None)
        llm_adapter = getattr(pipeline.assistant, "llm", None)
        
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
        participant_snapshot = (
            pipeline.build_participant_snapshot()
            if hasattr(pipeline, "build_participant_snapshot")
            else None
        )
        participants = _build_participants(participant_snapshot, user)

        db = app.state.history_store
        partner_id_to_persist: str | None = None
        persisted_partner_model = None
        pipeline_partner_id = getattr(pipeline, "partner_id", None)
        if pipeline_partner_id and db:
            try:
                # Only persist partner_id when it references a real conversation partner.
                partner_model = await get_partner_by_id(db, pipeline_partner_id, user_id=user_id)
                if partner_model:
                    partner_id_to_persist = partner_model.id
                    persisted_partner_model = partner_model
                else:
                    LOGGER.info(
                        "[AutoSave] Skipping unknown partner_id=%s for session %s",
                        pipeline_partner_id,
                        session_id,
                    )
            except Exception as exc:
                LOGGER.warning(
                    "[AutoSave] Failed to validate partner_id=%s for session %s: %s",
                    pipeline_partner_id,
                    session_id,
                    exc,
                )

        learning_lang_cfg = getattr(pipeline.assistant, "learning_lang", None)
        native_lang_cfg = getattr(pipeline.assistant, "native_lang", None)

        await upsert_conversation(
            db,
            user_id=user_id,
            session_id=session_id,
            title=title,
            summary=analysis.get("feedback"),
            feedback=analysis.get("feedback"),
            scores=analysis.get("scores"),
            messages=messages,
            learning_lang=learning_lang_cfg,
            native_lang=native_lang_cfg,
            started_at=started_at or ended_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            partner_id=partner_id_to_persist,
            participant_snapshot=participant_snapshot,
        )

        if persisted_partner_model and llm_adapter:
            await _maybe_enrich_live_partner(
                db,
                persisted_partner_model,
                llm_adapter,
                messages,
                learning_lang_cfg,
                native_lang_cfg,
                session_id,
            )
        
        # Add conversation messages to Zep thread (REQUIRED for memory)
        # Zep will automatically extract facts, entities, and build knowledge graph
        # Include participant metadata and timestamps for better graph construction (Zep best practice)
        try:
            await pipeline.memory.add_conversation_messages(
                thread_id=getattr(pipeline, "memory_thread_id", session_id),
                user_id=user_id,
                messages=messages,
                session_start_time=started_epoch,
                participants=participants,
            )
            LOGGER.info(f"[AutoSave] Added {len(messages)} messages to Zep thread {session_id}")
            LOGGER.info("[AutoSave] Zep will automatically extract facts and entities from these messages")
        except Exception as e:
            LOGGER.error(f"[AutoSave] Failed to add messages to Zep thread: {e}", exc_info=True)
        
        # Clear session owner
        await app.state.app_state.clear_session_owner(session_id)
        
        LOGGER.info(f"[AutoSave] Successfully saved conversation for session {session_id}")
    except Exception as e:
        LOGGER.exception(f"[AutoSave] Failed to auto-save conversation for session {session_id}: {e}")
    finally:
        if session_manager is not None:
            try:
                await session_manager.remove_pipeline(session_id)
            except Exception as exc:
                LOGGER.warning(
                    "[AutoSave] Failed to dispose pipeline for session %s: %s",
                    session_id,
                    exc,
                )


async def _maybe_enrich_live_partner(
    db,
    partner,
    llm_adapter,
    messages: list[dict[str, Any]],
    learning_lang: str | None,
    native_lang: str | None,
    session_id: str,
) -> None:
    """Use LLM to extract partner profile hints and update placeholder partners."""
    try:
        meta = partner.extra_metadata or {}
        if meta.get("type") != "live_call":
            return
        extracted = await extract_partner_profile_with_llm(
            llm_adapter,
            messages,
            learning_lang,
            native_lang,
        )
        if not extracted:
            return
        candidate_name = (extracted.get("name") or "").strip()
        candidate_desc = (extracted.get("description") or "").strip()
        normalized_name = candidate_name.lower() if candidate_name else ""
        if normalized_name in {"", "partner", "teacher", "tutor"}:
            candidate_name = None
        if candidate_desc == "":
            candidate_desc = None
        updates: dict[str, Any] = {}
        if candidate_name and candidate_name != partner.name:
            updates["name"] = candidate_name
        if candidate_desc is not None and candidate_desc != partner.description:
            updates["description"] = candidate_desc
        meta_update = dict(meta)
        meta_update["last_autofill_session"] = session_id
        if candidate_name:
            meta_update["auto_name_source"] = "conversation_llm"
        if candidate_desc:
            meta_update["auto_description_source"] = "conversation_llm"
        if meta_update != meta:
            updates.setdefault("extra_metadata", meta_update)
        if not updates:
            return
        await update_partner_details(
            db,
            partner.id,
            name=updates.get("name"),
            description=updates.get("description"),
            extra_metadata=updates.get("extra_metadata"),
        )
        LOGGER.info(
            "[AutoSave] Updated live-call partner %s with extracted profile (name=%s)",
            partner.id,
            updates.get("name"),
        )
    except Exception as exc:
        LOGGER.warning(
            "[AutoSave] Failed to enrich partner %s from session %s: %s",
            getattr(partner, "id", "unknown"),
            session_id,
            exc,
        )
