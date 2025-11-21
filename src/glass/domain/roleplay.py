"""AI roleplay for roleplay mode AI interactions."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any

from . import prompts
from ..utils.language import lang_code_to_name

if TYPE_CHECKING:
    from .memory import ConversationMemory
    from .ports import LLMPort

LOGGER = logging.getLogger(__name__)


class Roleplay:
    """Handle AI roleplay in roleplay mode."""

    def __init__(
        self,
        session_id: str,
        llm: LLMPort,
        emit_callback,
        memory: ConversationMemory | None = None,
    ):
        self.session_id = session_id
        self.llm = llm
        self._emit = emit_callback
        self.memory = memory

        # Configuration
        self.partner_name: str | None = None
        self.partner_description: str | None = None
        self.partner_voice_id: str | None = None
        self.partner_id: str | None = None
        self.user_name: str | None = None
        self.learning_lang: str = "en"
        self.native_lang: str = "ko"

        self._translations: dict[str, str] = {}

    def set_user_name(self, name: str | None) -> None:
        self.user_name = name.strip() if isinstance(name, str) and name.strip() else None

    async def _update_conversation_summary(self) -> None:
        """Update conversation summary in background (non-blocking)."""
        if not self.memory:
            return

        try:
            # Get conversation for summary (excludes most recent 6 messages)
            # This ensures summary + recent_conversation are complementary without gaps
            conversation_for_summary = self.memory.get_conversation_for_summary(exclude_recent=6)

            # Format conversation for summary
            conv_lines: list[str] = []
            for message in conversation_for_summary:
                role = (message.get("role") or "partner").lower()
                # Skip Glass AI assistant messages (feedback/suggestions)
                if role == "assistant":
                    continue
                speaker = "User" if role == "user" else "Partner"
                text = (message.get("text") or "").strip()
                if text:
                    conv_lines.append(f"{speaker}: {text}")

            if not conv_lines:
                # Not enough conversation history to summarize yet
                return

            # Get existing summary
            existing_summary = self.memory.get_conversation_context_summary()

            # Generate updated summary
            system_prompt, user_prompt = prompts.build_conversation_summary_prompt(
                conversation_lines=conv_lines,
                existing_summary=existing_summary if existing_summary else None,
            )

            LOGGER.info(f"[Conversation Summary] SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}")

            new_summary = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.3,
            )

            if new_summary and new_summary.strip():
                self.memory.update_conversation_context_summary(new_summary.strip())
                LOGGER.info(f"[Conversation Summary] Updated: {new_summary[:100]}...")

        except Exception as e:
            LOGGER.warning(f"[Conversation Summary] Failed to update: {e}")

    async def _search_memories(self, query: str) -> str:
        """Search relevant memories for the AI."""
        if not self.memory or not self.partner_id:
            return "No memories available."

        try:
            # Search memories with partner filter
            results = await self.memory.memory.semantic_search_memories(
                user_id=self.memory.user_id,
                query_text=query,
                partner_id=self.partner_id,
                scopes=["user", "partner", "interaction"],  # All scopes, filtered by partner
                limit=5,
                similarity_threshold=0.15,
                rerank=False,
            )

            if not results:
                return "No relevant memories found."

            # Format results by scope with timestamps
            from ..utils.time import format_relative_time_compact

            # Group by scope
            user_facts = []
            partner_facts = []
            interaction_facts = []

            for mem in results:
                text = mem["text"]
                if len(text) > 100:
                    text = text[:100] + "..."

                # Add timestamp
                time_str = format_relative_time_compact(mem.get("updated_at") or mem.get("created_at"))
                formatted = f"- [{time_str}] {text}"

                if mem["scope"] == "user":
                    user_facts.append(formatted)
                elif mem["scope"] == "partner":
                    partner_facts.append(formatted)
                elif mem["scope"] == "interaction":
                    interaction_facts.append(formatted)

            # Build formatted result
            sections = []
            if user_facts:
                sections.append("About the user:\n" + "\n".join(user_facts))
            if partner_facts:
                sections.append(f"About you ({self.partner_name}):\n" + "\n".join(partner_facts))
            if interaction_facts:
                sections.append("Your interactions:\n" + "\n".join(interaction_facts))

            return "\n\n".join(sections) if sections else "No relevant memories found."
        except Exception as e:
            LOGGER.error(f"[Roleplay] Memory search failed: {e}")
            return "Memory search failed."

    async def generate_ai_response(
        self,
        user_text: str,
        *,
        relationship_context: str = "",
    ) -> str:
        """Generate AI conversation partner response.

        Args:
            user_text: User's message
            relationship_context: Prior relationship memories with this partner

        Returns:
            AI response text
        """
        try:
            LOGGER.info("[Roleplay] Generating response")

            target_lang = lang_code_to_name(self.learning_lang)
            native_lang = lang_code_to_name(self.native_lang)

            # Get recent conversation from memory
            recent_conversation: list[dict] = []
            if self.memory:
                recent_conversation = self.memory.get_conversation_recent_history(limit=6)

            # Build prompt
            recent_conv_texts: list[str] = []
            for message in recent_conversation:
                role = (message.get("role") or "partner").lower()
                # Skip Glass AI assistant messages (feedback/suggestions)
                if role == "assistant":
                    continue
                if role == "user":
                    speaker = "User"
                    name = self.user_name
                elif role == "partner":
                    speaker = "Partner"
                    name = self.partner_name
                else:
                    # Skip unknown roles
                    continue
                text = (message.get("text") or "").strip()
                if not text:
                    continue
                label = f"{speaker} ({name})" if name else speaker
                recent_conv_texts.append(f"{label}: {text}")
            if not recent_conv_texts:
                recent_conv_texts = ["(No recent conversation yet)"]

            # Get conversation summary from memory
            conversation_summary = ""
            if self.memory:
                conversation_summary = self.memory.get_conversation_context_summary()

            system_prompt, user_prompt = prompts.build_ai_response_prompt(
                user_text=user_text,
                partner_name=self.partner_name,
                partner_description=self.partner_description,
                target_lang=target_lang,
                native_lang=native_lang,
                recent_conversation=recent_conv_texts,
                conversation_summary=conversation_summary,
                relationship_context=relationship_context,
                user_name=self.user_name,
            )

            LOGGER.info(f"[AI Response] SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}")

            # Define memory search tool
            tools = [
                {
                    "type": "function",
                    "function": {
                        "name": "search_memories",
                        "description": "Search past conversation memories to recall specific information about the user, yourself, or your interactions. Use this when the user asks about something from the past that you don't immediately know.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "What to search for in past memories (e.g., 'user hobbies', 'where user works', 'what we talked about last time')",
                                }
                            },
                            "required": ["query"],
                        },
                    },
                }
            ]

            # Generate response with tool calling
            ai_response = await self.llm.call(
                prompt=user_prompt,
                system=system_prompt,
                temperature=0.8,
                tools=tools,
                tool_choice="auto",  # Let AI decide when to use tools
            )

            # Handle tool calls
            if isinstance(ai_response, dict) and ai_response.get("type") == "tool_calls":
                LOGGER.info(f"[Roleplay] AI requested tool call")
                tool_results = []

                for tool_call in ai_response["tool_calls"]:
                    if tool_call["name"] == "search_memories":
                        import json

                        args = json.loads(tool_call["arguments"])
                        query = args.get("query", "")
                        LOGGER.info(f"[Roleplay] Searching memories: {query}")

                        result = await self._search_memories(query)
                        tool_results.append(
                            {
                                "tool_call_id": tool_call["id"],
                                "name": tool_call["name"],
                                "content": result,
                            }
                        )

                # Call LLM again with tool results
                messages = [
                    {"role": "user", "content": user_prompt},
                    ai_response["message"],
                ]

                # Add tool results
                for tr in tool_results:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tr["tool_call_id"],
                            "name": tr["name"],
                            "content": tr["content"],
                        }
                    )

                # Get final response
                final_response = await self.llm.call(
                    messages=messages,
                    system=system_prompt,
                    temperature=0.8,
                )

                if isinstance(final_response, str) and final_response.strip():
                    LOGGER.info(f"[Roleplay] Generated with memory: {final_response[:50]}...")
                    return final_response.strip()
                else:
                    LOGGER.warning(f"[Roleplay] Empty response after tool call")
                    return ""

            # Standard response (no tool calls)
            if isinstance(ai_response, str) and ai_response.strip():
                LOGGER.info(f"[Roleplay] Generated: {ai_response[:50]}...")
                return ai_response.strip()

            return ""

        except Exception as e:
            LOGGER.error(f"[Roleplay] Failed to generate response: {e}", exc_info=True)
            return ""

    async def emit_ai_turn(
        self,
        user_text: str,
        user_utterance_id: str,
        event_type_transcript,
        event_type_translation,
        *,
        relationship_context: str = "",
        user_message_end_time: float | None = None,
    ) -> dict | None:
        """Generate and emit AI conversation turn.

        Args:
            user_text: User's message
            user_utterance_id: User's utterance ID
            event_type_transcript: Transcript event type
            event_type_translation: Translation event type
            relationship_context: Prior relationship memories with this partner
            user_message_end_time: When user finished speaking

        Returns:
            AI message dict for storage, or None if failed
        """
        # Generate AI response (gets recent conversation and summary from memory internally)
        ai_response = await self.generate_ai_response(
            user_text,
            relationship_context=relationship_context,
        )

        if not ai_response:
            return None

        ai_utterance_id = str(uuid.uuid4())

        # Calculate timing (AI responds shortly after user)
        ai_start_time = user_message_end_time + 0.5 if user_message_end_time is not None else 0.0
        ai_duration = len(ai_response) * 0.05  # ~0.05s per character

        # Emit AI transcript with TTS flag and voice_id
        await self._emit(
            event_type_transcript,
            {
                "utterance_id": ai_utterance_id,
                "text": ai_response,
                "is_final": True,
                "speech_final": True,
                "lang": self.learning_lang,
                "auto_tts": True,  # Signal for automatic TTS
                "voice_id": self.partner_voice_id,  # Include voice_id for TTS
                "start": ai_start_time,
                "duration": ai_duration,
                "end": ai_start_time + ai_duration,
                "audio_cursor": ai_start_time + ai_duration,
                "latency_ms": 0,
                "completed_by": "speech_final",
            },
            source="ai",
        )

        # Translate AI response in parallel (non-blocking)
        import asyncio

        async def translate_and_emit():
            """Background task to translate and emit translation."""
            try:
                native_lang_name = lang_code_to_name(self.native_lang)
                target_lang_name = lang_code_to_name(self.learning_lang)

                system_prompt, user_prompt = prompts.build_translation_prompt(
                    ai_response, target_lang_name, native_lang_name
                )
                ai_translation = await self.llm.call(
                    prompt=user_prompt,
                    system=system_prompt,
                    temperature=0.3,
                )

                if ai_translation:
                    await self._emit(
                        event_type_translation,
                        {
                            "utterance_id": ai_utterance_id,
                            "text": ai_translation,
                            "source_lang": self.learning_lang,
                            "target_lang": self.native_lang,
                        },
                        source="ai",
                    )
                    self._translations[ai_utterance_id] = ai_translation
                    LOGGER.info(f"[Roleplay] Translation completed for {ai_utterance_id}")
            except Exception as e:
                LOGGER.warning(f"[Roleplay] Translation failed: {e}")

        async def update_summary_background():
            """Background task to update conversation summary (only if needed)."""
            # Check if summary should be updated (efficient throttling)
            if not self.memory or not self.memory.should_update_summary(
                message_threshold=8,  # Update after 8 new messages
                time_threshold=300.0,  # Or after 5 minutes
            ):
                return

            # Wait a bit for the AI message to be added to memory
            await asyncio.sleep(0.5)
            # Update summary (gets recent conversation from memory internally)
            await self._update_conversation_summary()

        # Start translation and summary update in background (parallel with TTS)
        asyncio.create_task(translate_and_emit())
        asyncio.create_task(update_summary_background())

        LOGGER.info(f"[Roleplay] Completed turn for {user_utterance_id}")

        # Return message for storage (translation will be added later)
        return {
            "text": ai_response,
            "utterance_id": ai_utterance_id,
            "translation": None,  # Translation will come later via event
            "language": self.learning_lang,
        }
