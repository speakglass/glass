"""Audio helpers for decoding and VAD placeholders."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, Iterable
import httpx

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


async def iter_multiplexed_audio(websocket, source_queues: dict[str, asyncio.Queue], pipeline=None) -> None:
    """Demultiplex audio: first byte is source ID (0x01=mic, 0x02=system)."""
    try:
        from ..config import get_settings
        max_bytes = int(get_settings().ws_max_message_bytes)
    except Exception:
        max_bytes = 131072
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
                if len(data) < 2:
                    continue
                
                source_id = data[0]
                audio_data = data[1:]
                
                if source_id == SOURCE_MICROPHONE:
                    source_name = "mic"
                elif source_id == SOURCE_SYSTEM:
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
                    elif msg_type == "set_feedback_mode" and pipeline:
                        # Set feedback mode for the session
                        mode = data.get("mode", "auto")
                        pipeline.set_feedback_mode(mode)
                        LOGGER.info(f"Feedback mode set to: {mode}")
                    elif msg_type == "session_config" and pipeline:
                        # Set session configuration (languages, mode, scenario)
                        learning_lang = data.get("learning_lang", "en")
                        native_lang = data.get("native_lang", "ko")
                        mode = data.get("mode", "real")
                        scenario = data.get("scenario", None)
                        pipeline.set_session_config(learning_lang, native_lang, mode, scenario)
                        LOGGER.info(f"Session config - learning: {learning_lang}, native: {native_lang}, mode: {mode}, scenario: {scenario}")
                    elif msg_type == "set_suggest_mode" and pipeline:
                        mode = data.get("mode", "auto")
                        pipeline.set_suggest_mode(mode)
                        LOGGER.info(f"Suggest mode set to: {mode}")
                    elif msg_type == "set_profile" and pipeline:
                        proficiency = data.get("proficiency")
                        pronunciation_mode = data.get("pronunciation_mode")
                        pipeline.set_user_profile(proficiency=proficiency, pronunciation_mode=pronunciation_mode)
                        LOGGER.info(f"Profile set - proficiency: {proficiency}, pronunciation_mode: {pronunciation_mode}")
                    elif msg_type == "request_answer" and pipeline:
                        # Generate answer and emit as event
                        asyncio.create_task(_handle_answer_request(pipeline))
                    elif msg_type == "request_follow_up" and pipeline:
                        # Generate follow-up and emit as event
                        asyncio.create_task(_handle_follow_up_request(pipeline))
                    elif msg_type == "request_tts":
                        # Stream TTS audio from ElevenLabs
                        text = data.get("text", "")
                        voice_id = data.get("voice_id")
                        request_id = data.get("request_id")
                        if text:
                            asyncio.create_task(_handle_tts_request(websocket, text, voice_id, request_id))
                except (json.JSONDecodeError, KeyError):
                    pass
            
    finally:
        for queue in source_queues.values():
            await queue.put(None)


async def _handle_answer_request(pipeline) -> None:
    """Handle answer generation request."""
    try:
        from ..domain.entities import EventType
        suggestion = await pipeline.generate_answer()
        if isinstance(suggestion, dict):
            await pipeline._emit(
                EventType.ANSWER,
                {"text": suggestion.get("target_text", ""), "suggestion": suggestion},
            )
        else:
            await pipeline._emit(EventType.ANSWER, {"text": str(suggestion)})
    except Exception as e:
        LOGGER.error(f"Failed to generate answer: {e}")


async def _handle_follow_up_request(pipeline) -> None:
    """Handle follow-up generation request."""
    try:
        from ..domain.entities import EventType
        suggestion = await pipeline.generate_follow_up()
        if isinstance(suggestion, dict):
            await pipeline._emit(
                EventType.FOLLOW_UP,
                {"text": suggestion.get("target_text", ""), "suggestion": suggestion},
            )
        else:
            await pipeline._emit(EventType.FOLLOW_UP, {"text": str(suggestion)})
    except Exception as e:
        LOGGER.error(f"Failed to generate follow-up: {e}")


async def _handle_tts_request(websocket, text: str, voice_id: str | None = None, request_id: str | None = None) -> None:
    """Handle TTS request and stream audio back via WebSocket."""
    try:
        from ..config import get_settings
        settings = get_settings()
        
        if not settings.elevenlabs_api_key:
            LOGGER.warning("ElevenLabs API key not configured")
            await websocket.send_json({"t": "tts_error", "error": "TTS not configured", "request_id": request_id})
            return
        
        voice = voice_id or settings.elevenlabs_voice_id
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream"
        
        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
        }
        
        payload = {
            "text": text,
            "model_id": settings.elevenlabs_model,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True
            }
        }
        
        LOGGER.info(f"Requesting TTS for text: {text[:50]}...")
        
        # Send TTS start event
        await websocket.send_json({"t": "tts_start", "request_id": request_id})
        
        # Stream audio chunks from ElevenLabs
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    LOGGER.error(f"ElevenLabs API error: {response.status_code} - {error_text}")
                    await websocket.send_json({"t": "tts_error", "error": "TTS API error", "request_id": request_id})
                    return
                
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    if chunk:
                        # Send audio chunk as binary
                        await websocket.send_bytes(chunk)
        
        # Send TTS end event
        await websocket.send_json({"t": "tts_end", "request_id": request_id})
        LOGGER.info("TTS streaming completed")
        
    except Exception as e:
        LOGGER.error(f"TTS request failed: {e}", exc_info=True)
        try:
            await websocket.send_json({"t": "tts_error", "error": str(e), "request_id": request_id})
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
