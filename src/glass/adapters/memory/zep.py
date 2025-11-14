"""Zep Cloud memory adapter with Knowledge Graph support."""

from __future__ import annotations

import asyncio
import json
import logging
import time

LOGGER = logging.getLogger(__name__)


class ZepMemoryAdapter:
    """Zep Cloud memory adapter using Knowledge Graph.
    
    This adapter:
    - Stores conversation messages in threads
    - Persists extracted information in the graph
    - Retrieves relevant context for AI responses
    - Maintains a singleton client for optimal performance
    """

    _client = None  # Singleton client instance

    def __init__(self, api_key: str, project_id: str | None = None):
        self.api_key = api_key
        self.project_id = project_id
        
        # Caching for user-level context (5 min TTL)
        self._user_context_cache: dict[str, tuple[str, float]] = {}
        self._cache_ttl = 300  # 5 minutes
        
        self._ensure_client()

    def _ensure_client(self):
        """Ensure Zep client is initialized (singleton pattern)."""
        if ZepMemoryAdapter._client is None:
            try:
                from zep_cloud.client import AsyncZep
                ZepMemoryAdapter._client = AsyncZep(api_key=self.api_key)
                LOGGER.info("Zep client initialized successfully")
            except ImportError:
                LOGGER.error("zep-cloud package not installed. Install with: pip install zep-cloud")
                raise
            except Exception as e:
                LOGGER.error(f"Failed to initialize Zep client: {e}")
                raise

    @property
    def client(self):
        """Get the singleton Zep client."""
        self._ensure_client()
        return ZepMemoryAdapter._client

    async def retrieve(
        self,
        session_id: str,
        query: str,
        *,
        k: int = 5,
    ) -> list[dict]:
        """Retrieve relevant context from Zep using the thread's context.
        
        Args:
            session_id: Thread ID to retrieve context for
            query: Query string (used if thread doesn't have enough context)
            k: Number of results (not used, Zep determines relevance)
        
        Returns:
            List of relevant facts and entities
        """
        try:
            # Get user context for the thread
            memory = await self.client.thread.get_user_context(
                thread_id=session_id,
                mode="basic",  # Use basic mode for lower latency (< 200ms)
            )
            
            # Parse the context block into structured data
            results = self._parse_context_block(memory.context)
            
            return results

        except Exception as e:
            LOGGER.error(f"Failed to retrieve from Zep: {e}", exc_info=True)
            return []

    def _parse_context_block(self, context: str) -> list[dict]:
        """Parse Zep's context block into structured data."""
        results: list[dict] = []
        
        if not context:
            return results

        def extract_section(tag: str) -> str | None:
            start_tag = f"<{tag}>"
            end_tag = f"</{tag}>"
            if start_tag in context and end_tag in context:
                return context.split(start_tag, 1)[1].split(end_tag, 1)[0]
            return None

        def parse_line(line: str) -> tuple[str, dict | None]:
            """Separate text from trailing date range `(... - ...)`."""
            line = line.strip()
            if not line:
                return "", None
            range_data = None
            if line.endswith(")") and "(" in line:
                start_idx = line.rfind("(")
                candidate = line[start_idx + 1 : -1]
                if " - " in candidate:
                    parts = [part.strip() for part in candidate.split(" - ", 1)]
                    if len(parts) == 2:
                        range_data = {
                            "start": parts[0] if parts[0].lower() != "present" else None,
                            "end": parts[1] if parts[1].lower() != "present" else None,
                        }
                        line = line[:start_idx].rstrip()
            return line, range_data

        facts_section = extract_section("FACTS")
        if facts_section:
            for line in facts_section.strip().split("\n"):
                line = line.strip()
                if not line.startswith("- "):
                    continue
                fact_text, date_range = parse_line(line[2:])
                if fact_text:
                    results.append(
                        {
                            "type": "fact",
                            "text": fact_text,
                            "range": date_range,
                        }
                    )

        entities_section = extract_section("ENTITIES")
        if entities_section:
            current_entity = None
            current_text: list[str] = []

            for line in entities_section.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                if line.startswith("- "):
                    if current_entity:
                        results.append(
                            {
                                "type": "entity",
                                "label": current_entity,
                                "text": " ".join(current_text).strip(),
                            }
                        )
                    entry = line[2:]
                    if ":" in entry:
                        name, desc = entry.split(":", 1)
                        current_entity = name.strip()
                        current_text = [desc.strip()]
                    else:
                        current_entity = entry.strip()
                        current_text = []
                elif current_entity:
                    current_text.append(line)

            if current_entity:
                results.append(
                    {
                        "type": "entity",
                        "label": current_entity,
                        "text": " ".join(current_text).strip(),
                    }
                )

        episodes_section = extract_section("EPISODES")
        if episodes_section:
            for line in episodes_section.strip().split("\n"):
                line = line.strip()
                if not line.startswith("- "):
                    continue
                episode_text, date_range = parse_line(line[2:])
                if episode_text:
                    results.append(
                        {
                            "type": "episode",
                            "text": episode_text,
                            "range": date_range,
                        }
                    )

        return results

    async def get_user_context_block(self, user_id: str, use_cache: bool = True) -> str:
        """Get user-level context from Zep Knowledge Graph (all past conversations).
        
        This fetches the user's accumulated knowledge from all their past conversations.
        Use this at session start to get long-term memory.
        
        Args:
            user_id: User ID to get context for
            use_cache: Whether to use cached context (default: True)
        
        Returns:
            Formatted context block string with user's facts and preferences
        """
        # Check cache
        if use_cache and user_id in self._user_context_cache:
            cached_context, cached_time = self._user_context_cache[user_id]
            age = time.time() - cached_time
            if age < self._cache_ttl:
                LOGGER.debug(f"[Cache HIT] User context for {user_id} (age: {age:.1f}s)")
                return cached_context
        
        # Cache miss - fetch from Zep
        try:
            LOGGER.debug(f"[Cache MISS] Fetching user context for {user_id}")
            
            # Try user.get_user_context first (Zep v3 best practice)
            try:
                memory = await self.client.user.get_user_context(user_id=user_id)
                context = memory.context
            except Exception:
                # Fallback to graph search
                edges = await self.client.graph.search(
                    user_id=user_id,
                    query="user information, preferences, background, interests, and past topics",
                    scope="edges",
                    limit=20,
                )
                
                facts = []
                for edge in edges.edges:
                    if hasattr(edge, 'fact') and edge.fact:
                        valid_info = ""
                        if hasattr(edge, 'valid_at') and edge.valid_at:
                            valid_info = f" (since {edge.valid_at})"
                        facts.append(f"  - {edge.fact}{valid_info}")
                
                context = "<FACTS>\n" + "\n".join(facts) + "\n</FACTS>" if facts else ""
            
            # Cache it
            if context:
                self._user_context_cache[user_id] = (context, time.time())
                LOGGER.info(f"Loaded user context for {user_id} ({len(context)} chars)")
            else:
                LOGGER.info(f"No prior context for user {user_id} (new user)")
            
            return context
                
        except Exception as e:
            LOGGER.error(f"Failed to get user context: {e}", exc_info=True)
            return ""
    
    def invalidate_user_cache(self, user_id: str):
        """Invalidate cached user context (e.g., after important updates)"""
        self._user_context_cache.pop(user_id, None)
        LOGGER.debug(f"[Cache] Invalidated user context for {user_id}")

    async def get_context_for_prompt(
        self,
        thread_id: str,
        user_id: str,
        scope: str = "thread",
        timeout: float = 3.0,
    ) -> str:
        """Get context for LLM prompts with timeout and error handling.
        
        Args:
            thread_id: Thread/session ID
            user_id: User ID
            scope: Context scope - "thread" (fast) or "hybrid" (thread + user)
            timeout: Timeout in seconds (default: 3.0)
        
        Returns:
            Formatted context string (empty string if error/timeout)
        """
        try:
            if scope == "thread":
                # Fast: thread context only (< 200ms)
                return await asyncio.wait_for(
                    self._get_thread_context(thread_id),
                    timeout=timeout
                )
            
            elif scope == "hybrid":
                # Balanced: user + thread contexts in parallel
                tasks = [
                    asyncio.wait_for(
                        self._get_thread_context(thread_id),
                        timeout=2.0
                    ),
                    # User context uses cache
                    asyncio.wait_for(
                        self.get_user_context_block(user_id, use_cache=True),
                        timeout=3.0
                    ),
                ]
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                thread_ctx = "" if isinstance(results[0], Exception) else results[0]
                user_ctx = "" if isinstance(results[1], Exception) else results[1]
                
                # Combine (partial success OK)
                if user_ctx and thread_ctx:
                    return f"{user_ctx}\n\n{thread_ctx}"
                return user_ctx or thread_ctx or ""
            
            else:
                LOGGER.warning(f"Unknown scope: {scope}, defaulting to thread")
                return await asyncio.wait_for(
                    self._get_thread_context(thread_id),
                    timeout=timeout
                )
        
        except asyncio.TimeoutError:
            LOGGER.warning(f"[Context] Timeout after {timeout}s for scope={scope}")
            return ""
        except Exception as e:
            LOGGER.error(f"[Context] Failed to get context: {e}")
            return ""
    
    async def _get_thread_context(self, thread_id: str) -> str:
        """Get thread-level context (current conversation only)."""
        try:
            memory = await self.client.thread.get_user_context(
                thread_id=thread_id,
                mode="basic",  # Fast mode (< 200ms)
            )
            return memory.context
        except Exception as e:
            LOGGER.warning(f"Failed to get thread context: {e}")
            return ""

    async def get_raw_context_block(self, session_id: str, user_id: str | None = None) -> str:
        """Get thread-level context from Zep (current conversation only).
        
        DEPRECATED: Use get_context_for_prompt() instead.
        
        This is optimized for AI prompts during an active conversation.
        For session start, use get_user_context_block() instead.
        
        Args:
            session_id: Thread ID to get context for
            user_id: Optional user ID for fallback to user context
        
        Returns:
            Formatted context block string
        """
        return await self._get_thread_context(session_id)

    async def get_structured_thread_context(
        self,
        session_id: str,
        user_id: str | None = None,
    ) -> dict[str, object]:
        """Return both raw and parsed context for a thread."""
        raw_context = await self.get_raw_context_block(session_id, user_id)
        items = self._parse_context_block(raw_context)
        return {
            "raw_context": raw_context,
            "items": items,
        }

    async def add_extracted_memories(
        self,
        user_id: str,
        session_id: str,
        extracted_info: list[dict],
    ) -> None:
        """DEPRECATED: Add extracted information to Zep's Knowledge Graph.
        
        NOTE: This method is deprecated. Zep automatically extracts facts and entities
        from messages added via add_conversation_messages(). Only use this for manually
        created memories (business data) that don't come from conversations.
        
        Args:
            user_id: User ID to associate memories with
            session_id: Session/thread ID for context (not used for manual memories)
            extracted_info: List of extracted information dictionaries
        """
        import warnings
        warnings.warn(
            "add_extracted_memories is deprecated. Use graph.add() directly for business data, "
            "or let Zep automatically extract from conversation messages.",
            DeprecationWarning,
            stacklevel=2
        )
        
        for info in extracted_info:
            label = info.get("label", "")
            value = info.get("value", "")
            
            if not value:
                continue
            
            try:
                await self.client.graph.add(
                    user_id=user_id,
                    data=json.dumps({
                        "type": label,
                        "content": value,
                        "source": "extracted",
                    }),
                    type="json",
                )
                
                LOGGER.debug(f"Added memory to Zep: {label} - {value[:50]}...")
            except Exception as e:
                LOGGER.error(f"Failed to add extracted memory to Zep: {e}")

    async def ensure_user(
        self, 
        user_id: str, 
        email: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> None:
        """Ensure a user exists in Zep, create if not exists.
        
        Including first_name and last_name improves Zep's ability to associate data
        and build a better knowledge graph.
        
        Args:
            user_id: User ID to ensure exists
            email: Optional email for user creation
            first_name: Optional first name
            last_name: Optional last name
        """
        try:
            # Try to get the user first
            try:
                await self.client.user.get(user_id=user_id)
                LOGGER.debug(f"Zep user {user_id} already exists")
            except Exception:
                # User doesn't exist, create it
                user_kwargs = {
                    "user_id": user_id,
                    "email": email or f"{user_id}@example.com",
                }
                if first_name:
                    user_kwargs["first_name"] = first_name
                if last_name:
                    user_kwargs["last_name"] = last_name
                    
                await self.client.user.add(**user_kwargs)
                LOGGER.info(f"Created Zep user {user_id} (name: {first_name} {last_name})")
        except Exception as e:
            LOGGER.error(f"Failed to ensure Zep user {user_id}: {e}")
            raise

    async def ensure_thread(self, thread_id: str, user_id: str) -> None:
        """Ensure a thread exists in Zep, create if not exists.
        
        Args:
            thread_id: Thread/session ID
            user_id: User ID that owns the thread
        """
        try:
            # Try to get the thread first
            try:
                await self.client.thread.get(thread_id=thread_id)
                LOGGER.debug(f"Zep thread {thread_id} already exists")
            except Exception:
                # Thread doesn't exist, create it
                await self.client.thread.create(
                    thread_id=thread_id,
                    user_id=user_id,
                )
                LOGGER.info(f"Created Zep thread {thread_id} for user {user_id}")
                # Thread creation automatically warms cache
        except Exception as e:
            LOGGER.error(f"Failed to ensure Zep thread {thread_id}: {e}")
            raise

    async def add_conversation_messages(
        self,
        thread_id: str,
        user_id: str,
        messages: list[dict],
        user_name: str | None = None,
        session_start_time: float | None = None,
    ) -> None:
        """Add conversation messages to Zep thread.
        
        Zep will automatically extract facts and entities from these messages
        to build the user's knowledge graph.
        
        Including the user's real name and timestamps improves Zep's graph construction
        and temporal understanding.
        
        Args:
            thread_id: Thread/session ID
            user_id: User ID
            messages: List of message dicts with 'speaker', 'source', 'text' fields
            user_name: Optional real user name (improves graph construction)
            session_start_time: Optional session start epoch time for timestamps
        """
        if not messages:
            return
        
        try:
            from zep_cloud.types import Message
            from datetime import datetime, timezone
            
            # Convert to Zep format
            zep_messages = []
            for idx, msg in enumerate(messages):
                speaker = msg.get("speaker", "unknown")
                source = msg.get("source", "unknown")
                content = msg.get("text", "")
                
                if not content:
                    continue
                
                # Format Glass feedback content to clearly distinguish from conversation
                if speaker == "glass":
                    # Add prefix to make it clear this is feedback, not conversation
                    if not content.startswith("["):
                        content = f"[Learning Feedback] {content}"
                
                # Determine role and name based on speaker and source
                # Zep v3 supports two roles: "user" and "assistant"
                # 
                # Name mapping for clear memory extraction:
                # - Practice mode: [User name] ↔ Partner (conversation practice) + Glass (learning feedback)
                # - Real Talk mode: [User name] ↔ Partner (real conversation partner)
                
                is_user_mic = (
                    source == "mic"
                    or speaker == "user"
                )
                
                if is_user_mic:
                    # Primary user speaking via microphone
                    role = "user"
                    # Zep v3 best practice: Use real user name for better entity extraction
                    name = user_name or "User"
                elif speaker == "ai":
                    # Practice mode: AI simulating conversation partner
                    role = "assistant"
                    name = "Partner"  # Clear role: conversation practice partner
                elif speaker == "glass":
                    # Glass learning assistant providing feedback/suggestions
                    # Clearly distinguish from conversation partner
                    role = "assistant"
                    name = "Learning Coach"  # Distinct from "Partner" (conversation)
                elif speaker == "partner" or source == "system":
                    # Real Talk mode: Real conversation partner via system audio
                    # Use "assistant" role even though it's a real person, to distinguish from primary user
                    # This ensures Zep extracts facts from the primary user, not the partner
                    role = "assistant"
                    name = "Partner"
                else:
                    # Fallback for unknown speakers
                    LOGGER.warning(f"Unknown speaker type: speaker={speaker}, source={source}, defaulting to Partner")
                    role = "assistant"
                    name = "Partner"
                
                # Calculate timestamp for temporal understanding
                # Zep docs: "Setting created_at is important for accurate temporal understanding"
                created_at = None
                if session_start_time and "start" in msg:
                    # Message has relative timestamp from session start
                    msg_epoch = session_start_time + msg["start"]
                    created_at = datetime.fromtimestamp(msg_epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                elif session_start_time:
                    # Approximate timestamp based on message order
                    # Assume 5 seconds between messages on average
                    msg_epoch = session_start_time + (idx * 5)
                    created_at = datetime.fromtimestamp(msg_epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                
                # Build metadata for better context understanding
                metadata = {}
                
                # Add role-specific metadata
                if is_user_mic:
                    # User (learner) metadata
                    metadata["is_learner"] = True
                    metadata["learning_context"] = True
                elif speaker == "glass":
                    # Glass (Learning Coach) metadata - distinguish from conversation
                    metadata["type"] = "feedback"
                    metadata["is_feedback"] = True
                    metadata["not_conversation"] = True  # Not part of actual conversation
                    # Try to link to target utterance
                    if msg.get("utterance_id"):
                        metadata["target_utterance_id"] = msg["utterance_id"]
                elif speaker == "ai":
                    # AI Partner metadata
                    metadata["is_ai_partner"] = True
                    metadata["mode"] = "practice"
                elif speaker == "partner" or source == "system":
                    # Real conversation partner
                    metadata["is_real_partner"] = True
                    metadata["mode"] = "real"
                
                msg_kwargs = {
                    "role": role,
                    "content": content,
                    "name": name,
                }
                if created_at:
                    msg_kwargs["created_at"] = created_at
                if metadata:
                    msg_kwargs["metadata"] = metadata
                
                zep_msg = Message(**msg_kwargs)
                zep_messages.append(zep_msg)
                
                # Log message structure for debugging
                LOGGER.debug(
                    f"[Zep] Adding message - role={role}, name={name}, "
                    f"content_preview={content[:50]}..., metadata={metadata}"
                )
            
            if zep_messages:
                # Log message composition summary
                user_count = sum(1 for m in zep_messages if m.role == "user")
                partner_count = sum(1 for m in zep_messages if m.name == "Partner")
                coach_count = sum(1 for m in zep_messages if m.name == "Learning Coach")
                LOGGER.info(
                    f"[Zep] Message composition - User: {user_count}, "
                    f"Partner: {partner_count}, Learning Coach: {coach_count}, "
                    f"Total: {len(zep_messages)}"
                )
                
                # Zep has limits: max 30 messages per call, max 2,500 chars per message
                # Split messages into batches if needed
                MAX_MESSAGES_PER_BATCH = 30
                MAX_MESSAGE_LENGTH = 2500
                
                # Truncate long messages
                for msg in zep_messages:
                    if len(msg.content) > MAX_MESSAGE_LENGTH:
                        LOGGER.warning(f"Truncating message from {len(msg.content)} to {MAX_MESSAGE_LENGTH} chars")
                        msg.content = msg.content[:MAX_MESSAGE_LENGTH - 3] + "..."
                
                # Send in batches of 30
                for i in range(0, len(zep_messages), MAX_MESSAGES_PER_BATCH):
                    batch = zep_messages[i:i + MAX_MESSAGES_PER_BATCH]
                    await self.client.thread.add_messages(
                        thread_id=thread_id,
                        messages=batch,
                    )
                    LOGGER.info(f"Added {len(batch)} messages to Zep thread {thread_id} (batch {i // MAX_MESSAGES_PER_BATCH + 1})")
                
                LOGGER.info(f"✅ Total {len(zep_messages)} messages added to Zep thread {thread_id}")
                
                if hasattr(zep_messages[0], 'created_at') and zep_messages[0].created_at:
                    LOGGER.debug(f"⏰ Messages include timestamps for temporal understanding")
        except Exception as e:
            LOGGER.error(f"Failed to add messages to Zep: {e}", exc_info=True)

    async def warm_user_cache(self, user_id: str) -> None:
        """Warm the Zep cache for a user to improve retrieval latency.
        
        Note: Thread creation automatically warms cache, so this is optional.
        
        Args:
            user_id: User ID to warm cache for
        """
        try:
            await self.client.user.warm(user_id=user_id)
            LOGGER.debug(f"Warmed Zep cache for user {user_id}")
        except Exception as e:
            LOGGER.warning(f"Failed to warm cache for user {user_id}: {e}")
