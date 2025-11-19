"""WebSocket routes."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..adapters.websocket import WebSocketEventsAdapter
from ..auth.jwt import AuthenticatedUser, decode_service_token
from ..config import get_settings
from ..utils.audio import iter_multiplexed_audio
from ..persistence.service import (
    upsert_conversation,
    get_partner_by_id,
    update_partner_details,
    get_user_by_id,
    count_conversations,
)
from .helpers import (
    derive_conversation_title,
    generate_conversation_title_with_llm,
    extract_partner_profile_with_llm,
    build_memory_entries_with_llm,
)
from ..services.limits import conversation_limit_status

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


def _normalize_message_partner_ids(
    messages: list[dict[str, Any]] | None,
    *,
    pipeline_partner_id: str | None,
    persisted_partner_id: str | None,
) -> list[dict[str, Any]]:
    """Ensure persisted messages only reference valid partner IDs."""
    if not messages:
        return []
    normalized: list[dict[str, Any]] = []
    for entry in messages:
        if not isinstance(entry, dict):
            normalized.append(entry)
            continue
        payload = dict(entry)
        raw_partner_id = payload.get("partner_id")
        cleaned_partner_id = raw_partner_id.strip() if isinstance(raw_partner_id, str) else None
        if cleaned_partner_id and pipeline_partner_id and cleaned_partner_id == pipeline_partner_id:
            if persisted_partner_id:
                payload["partner_id"] = persisted_partner_id
            else:
                payload.pop("partner_id", None)
        elif not cleaned_partner_id:
            payload.pop("partner_id", None)
        normalized.append(payload)
    return normalized


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
    resolved_learning_lang = (learning_lang or "").strip().lower()
    resolved_native_lang = (native_lang or "").strip().lower()
    if history_store and user:
        try:
            account_user = await get_user_by_id(history_store, user.user_id)
        except Exception as exc:
            account_user = None
            LOGGER.warning("[WebSocket] Failed to load account user %s: %s", user.user_id, exc)
        if account_user:
            app_state_obj = app_state
            billing_service = getattr(app_state_obj, "billing_service", None)
            if billing_service:
                billing_payload = billing_service.user_status_payload(account_user)
                total_conversations = await count_conversations(history_store, user_id=user.user_id)
                limit_state = conversation_limit_status(
                    app_state_obj.settings,
                    billing_payload,
                    used=total_conversations,
                )
                if limit_state.blocked:
                    await websocket.close(code=4403, reason="conversation limit reached")
                    return
            if not resolved_learning_lang and account_user.learning_lang:
                resolved_learning_lang = account_user.learning_lang.strip().lower()
            if not resolved_native_lang and account_user.native_lang:
                resolved_native_lang = account_user.native_lang.strip().lower()
    if not resolved_learning_lang:
        resolved_learning_lang = "en"
    if not resolved_native_lang:
        resolved_native_lang = "en"
    learning_lang = resolved_learning_lang
    native_lang = resolved_native_lang
    if partner_id and user and history_store:
        partner_model = await get_partner_by_id(history_store, partner_id, user_id=user.user_id)
        if partner_model:
            partner_profile = _partner_to_profile(partner_model)
        else:
            LOGGER.warning(f"[Roleplay] Partner {partner_id} not found for user {user.user_id}")
    normalized_mode = (mode or "").lower()
    allow_system_audio = normalized_mode == "live_call"
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
    source_queues: dict[str, asyncio.Queue[bytes]] = {"mic": mic_queue}

    mic_task = asyncio.create_task(pipeline.process_audio_stream(_queue_to_iter(mic_queue), source="mic"))
    tasks: list[asyncio.Task] = [mic_task]

    if allow_system_audio:
        system_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=8)
        source_queues["system"] = system_queue
        system_task = asyncio.create_task(pipeline.process_audio_stream(_queue_to_iter(system_queue), source="system"))
        tasks.append(system_task)
    else:
        LOGGER.info(f"System audio disabled for session {sid} (mode={mode})")

    LOGGER.debug(
        f"Starting multiplexed audio streams for session {sid} (system_audio={'on' if allow_system_audio else 'off'})"
    )

    try:
        await iter_multiplexed_audio(
            websocket,
            source_queues,
            pipeline,
            db=history_store,
            user=user,
            allow_system_audio=allow_system_audio,
        )
        await asyncio.gather(*tasks)
    except WebSocketDisconnect:
        for task in tasks:
            task.cancel()
    except Exception:
        for task in tasks:
            task.cancel()
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


async def _auto_save_conversation(app, session_id: str, user: AuthenticatedUser, pipeline) -> None:
    """Automatically analyze and save conversation when WebSocket disconnects."""
    session_manager = getattr(app.state.app_state, "session_manager", None)
    conversation_id = getattr(pipeline, "conversation_id", None)
    if session_manager:
        await session_manager.mark_memory_pending(conversation_id)
    try:
        user_id = user.user_id
        LOGGER.info(f"[AutoSave] Starting auto-save for session {session_id}")

        # Collect messages with translations and timing (local operation, fast)
        full_conversation = pipeline.memory.get_full_conversation()
        messages = []
        for msg in full_conversation:
            message_kind = msg.get("kind")
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
                "kind",
            ):
                if key in msg and msg[key] is not None:
                    message_dict[key] = msg[key]
            utterance_id = msg.get("utterance_id")
            if utterance_id and message_kind not in {"feedback", "suggestion"}:
                if utterance_id in pipeline.assistant._translations:
                    message_dict["translation"] = pipeline.assistant._translations[utterance_id]
                elif utterance_id in pipeline.roleplay._translations:
                    message_dict["translation"] = pipeline.roleplay._translations[utterance_id]
            messages.append(message_dict)

        # Calculate timestamps
        started_epoch = pipeline.session_start_time
        started_at = (
            datetime.fromtimestamp(started_epoch, tz=timezone.utc)
            if isinstance(started_epoch, (int, float)) and started_epoch > 0
            else None
        )
        ended_at = datetime.now(timezone.utc)
        duration_seconds = max(0, int((ended_at - started_at).total_seconds())) if started_at else None

        # Run analysis and title generation in parallel
        native_lang = pipeline.assistant.native_lang
        learning_lang_cfg = pipeline.assistant.learning_lang
        native_lang_cfg = native_lang
        llm_adapter = pipeline.assistant.llm

        analysis_task = asyncio.create_task(pipeline.analyze_conversation())
        title_task = asyncio.create_task(
            generate_conversation_title_with_llm(
                llm_adapter,
                messages,
                native_lang,
            )
        )

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
            # Fallback to date-based title (durable extraction handled later)
            title = derive_conversation_title(started_at)
        else:
            title = title_result

        assistant = getattr(pipeline, "assistant", None)
        delayed_feedback: str | None = None
        if assistant and getattr(assistant, "feedback_mode", "auto") == "off":
            try:
                delayed_feedback = await assistant.generate_delayed_feedback(
                    full_conversation,
                    native_lang=native_lang,
                    learning_lang=learning_lang_cfg,
                )
            except Exception as exc:
                LOGGER.warning("[AutoSave] Unable to build delayed feedback: %s", exc)
        if delayed_feedback:
            analysis["feedback"] = delayed_feedback

        feedback_items: list[dict[str, Any]] | None = None
        if assistant:
            raw_feedback = getattr(assistant, "all_feedback", None)
            if raw_feedback:
                feedback_items = [dict(entry) for entry in raw_feedback if isinstance(entry, dict)]

        # Save to database
        # Note: Memory extraction is handled asynchronously (no extracted_info field)

        db = app.state.history_store
        partner_id_to_persist: str | None = None
        persisted_partner_model = None
        pipeline_partner_id = pipeline.partner_id
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

        interaction_summary = None
        memory_partner_id = pipeline_partner_id
        memory_entries: list[dict[str, str]] = []
        if llm_adapter:
            try:
                memory_entries = await build_memory_entries_with_llm(
                    llm_adapter,
                    messages,
                    native_lang_cfg,
                    partner_label=(pipeline.partner_profile or {}).get("name"),
                )
            except Exception as exc:
                LOGGER.debug("[AutoSave] Memory extraction skipped: %s", exc)

        app_state_obj = app.state.app_state
        memory_adapter = getattr(app_state_obj.session_manager, "memory_adapter", None)
        if partner_id_to_persist:
            memory_partner_id = partner_id_to_persist

        messages_for_persistence = _normalize_message_partner_ids(
            messages,
            pipeline_partner_id=pipeline_partner_id,
            persisted_partner_id=partner_id_to_persist,
        )

        await upsert_conversation(
            db,
            user_id=user_id,
            session_id=session_id,
            title=title,
            summary=analysis.get("feedback"),
            feedback=analysis.get("feedback"),
            scores=analysis.get("scores"),
            messages=messages_for_persistence,
            learning_lang=learning_lang_cfg,
            native_lang=native_lang_cfg,
            started_at=started_at or ended_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            partner_id=partner_id_to_persist,
            feedback_items=feedback_items,
        )

        if memory_adapter and memory_entries:
            conversation_binding = getattr(pipeline, "conversation_id", session_id)
            try:
                await memory_adapter.persist_memory_records(
                    user_id=user_id,
                    conversation_id=conversation_binding,
                    entries=memory_entries,
                    partner_id=memory_partner_id,
                    language_code=learning_lang_cfg,
                    native_language_code=native_lang_cfg,
                    started_at=started_at.timestamp() if started_at else None,
                    ended_at=ended_at.timestamp() if ended_at else None,
                )
            except Exception as exc:
                LOGGER.warning("[AutoSave] Failed to persist memory records: %s", exc)

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

        if memory_entries:
            for entry in memory_entries:
                if entry.get("scope") == "interaction":
                    interaction_summary = entry.get("text")
                    break

        if not interaction_summary:
            interaction_summary = analysis.get("feedback") if isinstance(analysis.get("feedback"), str) else None

        pipeline.memory.update_conversation_context_summary(interaction_summary)
        if hasattr(pipeline, "_last_conversation_summary_update"):
            pipeline._last_conversation_summary_update = time.time()

        # Clear session owner
        await app.state.app_state.clear_session_owner(session_id)

        LOGGER.info(f"[AutoSave] Successfully saved conversation for session {session_id}")
    except Exception as e:
        LOGGER.exception(f"[AutoSave] Failed to auto-save conversation for session {session_id}: {e}")
    finally:
        if session_manager:
            await session_manager.clear_memory_pending(conversation_id)
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
        if getattr(partner, "kind", None) != "live_call":
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
            partner.id if partner else "unknown",
            session_id,
            exc,
        )
