"""Audio helpers for decoding and VAD placeholders."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Iterable
from collections import deque
import httpx

from ..persistence.service import get_partner_by_id

LOGGER = logging.getLogger(__name__)

# Source identifiers for multiplexed audio streams
SOURCE_MICROPHONE = 0x01
SOURCE_SYSTEM = 0x02


async def iter_websocket_audio(websocket) -> AsyncIterator[bytes]:
    """Yield raw audio payloads from a FastAPI WebSocket."""
    try:
        from ..config import get_settings

        max_bytes = int(get_settings().ws_max_message_bytes)
    except Exception:
        max_bytes = 131072
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            break
        if "bytes" in message and message["bytes"] is not None:
            data = message["bytes"]
            if len(data) > max_bytes:
                try:
                    await websocket.close(code=1009)  # Message Too Big
                except Exception:
                    pass
                break
            yield data
        elif "text" in message and message["text"] == "close":
            break


def _partner_to_profile(partner) -> dict:
    return {
        "id": partner.id,
        "name": partner.name,
        "description": partner.description,
        "avatar_url": partner.avatar_url,
        "voice_id": partner.voice_id,
        "learning_lang": partner.learning_lang,
        "native_lang": partner.native_lang,
    }


def resolve_session_languages(
    mode: str,
    learning_lang: str | None,
    native_lang: str | None,
    partner_profile: dict[str, Any] | None,
) -> tuple[str, str]:
    """Determine session languages based on mode and partner profile.

    Use client-provided spoken languages when available with sensible fallbacks.
    """

    def _clean(value: Any) -> str | None:
        if isinstance(value, str):
            value = value.strip().lower()
            if value:
                return value
        return None

    resolved_learning = _clean(learning_lang)
    resolved_native = _clean(native_lang)

    if partner_profile:
        if not resolved_learning:
            resolved_learning = _clean(partner_profile.get("native_lang"))
        if not resolved_native:
            resolved_native = _clean(partner_profile.get("learning_lang"))

    return resolved_learning or "en", resolved_native or "en"


async def iter_multiplexed_audio(
    websocket,
    source_queues: dict[str, asyncio.Queue],
    pipeline=None,
    *,
    db=None,
    user=None,
    allow_system_audio: bool = True,
) -> None:
    """Demultiplex audio: first byte is source ID (0x01=mic, 0x02=system)."""
    try:
        from ..config import get_settings

        max_bytes = int(get_settings().ws_max_message_bytes)
    except Exception:
        max_bytes = 131072
    pending_chunk_meta: deque[str] = deque()
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                data = message["bytes"]
                if len(data) > max_bytes:
                    try:
                        await websocket.close(code=1009)
                    except Exception:
                        pass
                    break

                if pending_chunk_meta:
                    source_name = pending_chunk_meta.popleft()
                    queue = source_queues.get(source_name)
                    if queue:
                        await queue.put(data)
                    continue

                if len(data) < 2:
                    continue

                source_id = data[0]
                audio_data = data[1:]
                if source_id == SOURCE_MICROPHONE:
                    source_name = "mic"
                elif source_id == SOURCE_SYSTEM:
                    if not allow_system_audio:
                        LOGGER.debug("Dropping system audio frame (session mode disabled system capture)")
                        continue
                    source_name = "system"
                else:
                    LOGGER.debug(f"Unknown source ID: {source_id}")
                    continue

                if source_name in source_queues:
                    await source_queues[source_name].put(audio_data)

            elif "text" in message:
                text = message["text"]
                if text == "close":
                    break
                # Handle JSON messages
                try:
                    data = json.loads(text)
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif msg_type == "client_init":
                        # No-op for now; could store sample rate/encoding if needed
                        LOGGER.info(
                            "Client init: session=%s rate=%s encoding=%s",
                            data.get("session_id"),
                            data.get("sample_rate"),
                            data.get("encoding"),
                        )
                    elif msg_type == "audio_chunk":
                        source_name = data.get("source") or "mic"
                        pending_chunk_meta.append(source_name)
                    elif msg_type == "set_feedback_mode" and pipeline:
                        # Set feedback mode for the session
                        mode = data.get("mode", "auto")
                        pipeline.set_feedback_mode(mode)
                        LOGGER.info(f"Feedback mode set to: {mode}")
                    elif msg_type == "session_config" and pipeline:
                        # Set session configuration (languages, mode, partner)
                        learning_lang = data.get("learning_lang", "en")
                        native_lang = data.get("native_lang", "ko")
                        user_spoken_lang = data.get("user_spoken_lang")
                        partner_spoken_lang = data.get("partner_spoken_lang")
                        requested_mode = data.get("mode", "live_call")
                        normalized_mode = (requested_mode or "").strip().lower() or "live_call"
                        partner_profile = None
                        partner_id = data.get("partner_id")
                        if partner_id and db and user:
                            partner = await get_partner_by_id(db, partner_id, user_id=user.user_id)
                            if partner:
                                partner_profile = _partner_to_profile(partner)
                        if partner_profile is None:
                            # Preserve existing partner assignment (e.g., live-call placeholder)
                            partner_profile = getattr(pipeline, "partner_profile", None)
                        resolved_learning, resolved_native = resolve_session_languages(
                            normalized_mode,
                            learning_lang,
                            native_lang,
                            partner_profile,
                        )
                        await pipeline.set_session_config(
                            resolved_learning,
                            resolved_native,
                            normalized_mode,
                            partner=partner_profile,
                            user_spoken_lang=user_spoken_lang,
                            partner_spoken_lang=partner_spoken_lang,
                        )
                        LOGGER.info(
                            f"Session config - learning: {resolved_learning}, native: {resolved_native}, "
                            f"mode: {normalized_mode}, partner_id: {partner_id}, "
                            f"user_spoken={user_spoken_lang}, partner_spoken={partner_spoken_lang}"
                        )
                    elif msg_type == "set_suggest_mode" and pipeline:
                        mode = data.get("mode", "auto")
                        pipeline.set_suggest_mode(mode)
                        LOGGER.info(f"Suggest mode set to: {mode}")
                    elif msg_type == "set_suggest_length" and pipeline:
                        mode = data.get("mode", "auto")
                        pipeline.set_suggest_length_mode(mode)
                        LOGGER.info(f"Suggest length mode set to: {mode}")
                    elif msg_type == "set_profile" and pipeline:
                        language_level = data.get("language_level")
                        pronunciation_mode = data.get("pronunciation_mode")
                        pipeline.set_user_profile(language_level=language_level, pronunciation_mode=pronunciation_mode)
                        LOGGER.info(
                            f"Profile set - language_level: {language_level}, pronunciation_mode: {pronunciation_mode}"
                        )
                    elif msg_type == "request_suggestion" and pipeline:
                        # Generate suggestion (with or without hint)
                        text = data.get("text", "")  # Empty = auto suggestion, non-empty = with hint
                        request_id = data.get("request_id")
                        asyncio.create_task(_handle_suggestion_request(pipeline, text, request_id))
                    elif msg_type == "request_tts":
                        # Stream TTS audio via TTSProcessor
                        text = data.get("text", "")
                        voice_id = data.get("voice_id")
                        language = data.get("language")
                        source = data.get("source", "user")
                        request_id = data.get("request_id")
                        if text:
                            asyncio.create_task(
                                _handle_tts_request(pipeline, websocket, text, voice_id, language, source, request_id)
                            )
                    elif msg_type == "end_call":
                        LOGGER.info("Client requested end_call, closing session")
                        if pipeline is not None:
                            setattr(pipeline, "client_requested_end", True)
                        try:
                            await websocket.close(code=1000)
                        except Exception:
                            pass
                        break
                except (json.JSONDecodeError, KeyError):
                    pass

    finally:
        for queue in source_queues.values():
            await queue.put(None)


async def _handle_suggestion_request(pipeline, text: str = "", request_id: str | None = None) -> None:
    """Handle suggestion request (with or without hint)."""
    try:
        from ..domain.entities import EventType

        suggestion = await pipeline.generate_suggestion(text or None)

        if isinstance(suggestion, dict) and suggestion.get("target_text"):
            payload = {
                "text": suggestion.get("target_text", ""),
                "suggestion": suggestion,
            }
            if request_id:
                payload["request_id"] = request_id
            await pipeline._emit(EventType.SUGGESTION, payload)
    except Exception as e:
        LOGGER.error(f"Failed to generate suggestion: {e}")


async def _handle_tts_request(
    pipeline,
    websocket,
    text: str,
    voice_id: str | None = None,
    language: str | None = None,
    source: str = "user",
    request_id: str | None = None,
) -> None:
    """Handle TTS request via SpeechSynthesis and stream audio back."""
    try:
        if not pipeline.synthesis:
            LOGGER.warning("TTS not configured")
            await websocket.send_json(
                {
                    "t": "tts_error",
                    "error": "TTS not configured",
                    "request_id": request_id,
                }
            )
            return

        LOGGER.info(f"Processing TTS request: {text[:50]}...")

        # Send TTS start event
        await websocket.send_json({"t": "tts_start", "request_id": request_id})

        # Stream audio chunks via SpeechSynthesis
        async for chunk in pipeline.synthesis.synthesize_stream(
            text,
            language=language,
            source=source,
            voice_id=voice_id,
        ):
            if chunk:
                await websocket.send_bytes(chunk)

        # Send TTS end event
        await websocket.send_json({"t": "tts_end", "request_id": request_id})
        LOGGER.info("TTS streaming completed")

    except Exception as e:
        LOGGER.error(f"TTS request failed: {e}", exc_info=True)
        try:
            await websocket.send_json(
                {
                    "t": "tts_error",
                    "error": str(e),
                    "request_id": request_id,
                }
            )
        except Exception:
            pass


def sliding_window(samples: Iterable[float], window_size: int) -> Iterable[list[float]]:
    """Yield sliding windows for crude VAD placeholders."""
    window: list[float] = []
    for sample in samples:
        window.append(sample)
        if len(window) == window_size:
            yield window
            window = []
    if window:
        yield window
