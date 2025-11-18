"""Zep Cloud memory adapter with Knowledge Graph support."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Iterable

from zep_cloud.core.api_error import ApiError
from zep_cloud.types import EntityEdge, EntityNode, GraphSearchResults, ThreadContextResponse

from .schema import (
    GraphPayload,
    build_interaction_payload,
    build_partner_payload,
    build_conversation_fact_payload,
    build_user_persona_payload,
)

LOGGER = logging.getLogger(__name__)


def _safe_lower(value: Any | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text.lower() or None


def _safe_int(value: Any | None, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_iso_to_epoch(value: str | None) -> float:
    """Convert ISO timestamp to epoch seconds for sorting."""
    if not value:
        return 0.0
    try:
        # Ensure timezone awareness
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value).timestamp()
    except Exception:
        return 0.0


class ZepMemoryAdapter:
    """Zep Cloud memory adapter using Knowledge Graph.

    This adapter:
    - Stores conversation messages in threads
    - Persists extracted information in the graph
    - Retrieves relevant context for AI responses
    - Maintains a singleton client for optimal performance
    """

    _client = None  # Singleton client instance
    _ontology_configured: bool = False
    _ontology_lock: asyncio.Lock | None = None

    def __init__(self, api_key: str, project_id: str | None = None):
        self.api_key = api_key
        self.project_id = project_id

        # Caching for user-level context (5 min TTL)
        self._user_context_cache: dict[str, tuple[str, float]] = {}
        self._cache_ttl = 300  # 5 minutes
        self._pending_episodes: dict[str, set[str]] = {}

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

    def _document_client(self):
        """Return graph document client if available."""
        try:
            return self.client.graph.document
        except AttributeError:
            return None

    def _track_pending_episode(self, thread_id: str | None, episode_id: str | None) -> None:
        """Record episode IDs that are awaiting processing for a thread."""
        if not thread_id or not episode_id:
            return
        normalized = _safe_lower(thread_id)
        if not normalized:
            return
        self._pending_episodes.setdefault(normalized, set()).add(episode_id)

    async def _refresh_pending_episodes(self, *, user_id: str, thread_id: str) -> bool:
        """Check pending episodes for a thread and remove those that have been processed."""
        normalized = _safe_lower(thread_id) or thread_id
        if not normalized:
            return False
        pending = self._pending_episodes.get(normalized)
        if not pending:
            return False

        episode_ids = list(pending)
        tasks = [self._is_episode_processed(user_id, episode_id) for episode_id in episode_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        remaining: set[str] = set()

        for episode_id, status in zip(episode_ids, results):
            if isinstance(status, Exception):
                if isinstance(status, ApiError) and getattr(status, "status_code", None) == 404:
                    continue
                LOGGER.debug("[Zep] Episode status check failed for %s: %s", episode_id, status)
                remaining.add(episode_id)
            elif status:
                continue
            else:
                remaining.add(episode_id)

        if remaining:
            self._pending_episodes[normalized] = remaining
            return True

        self._pending_episodes.pop(normalized, None)
        return False

    async def _is_episode_processed(self, user_id: str, episode_id: str) -> bool:
        """Query Zep for an episode's processed status."""
        try:
            episode = await self.client.graph.episode.get(uuid_=episode_id)
            return bool(getattr(episode, "processed", False))
        except ApiError as exc:
            if getattr(exc, "status_code", None) == 404:
                return True
            raise

    def _episode_id_from_add_result(self, result: Any) -> str | None:
        if not result:
            return None
        for attr in ("uuid_", "episode_id", "id"):
            value = getattr(result, attr, None)
            if value:
                return str(value)
        return None

    async def configure_ontology(
        self,
        *,
        force: bool = False,
        user_ids: list[str] | None = None,
        graph_ids: list[str] | None = None,
    ) -> None:
        """Apply the Glass ontology definition to the current Zep project."""
        if not force and self.__class__._ontology_configured:
            return

        # Lazily initialize the lock inside an event loop
        if self.__class__._ontology_lock is None:
            self.__class__._ontology_lock = asyncio.Lock()

        async with self.__class__._ontology_lock:
            if not force and self.__class__._ontology_configured:
                return

            try:
                from .ontology import get_glass_edge_definitions, get_glass_entity_definitions
            except ImportError as exc:  # pragma: no cover - defensive import guard
                LOGGER.warning("[Zep] Custom ontology definitions missing: %s", exc)
                return

            graph_client = getattr(self.client, "graph", None)
            set_ontology = getattr(graph_client, "set_ontology", None)
            if not callable(set_ontology):
                LOGGER.debug("[Zep] Graph client does not support ontology configuration")
                return

            entities = get_glass_entity_definitions()
            edges = get_glass_edge_definitions()

            try:
                await set_ontology(
                    entities=entities,
                    edges=edges,
                    user_ids=user_ids,
                    graph_ids=graph_ids,
                )
                self.__class__._ontology_configured = True
                scope = "project" if not user_ids and not graph_ids else "scoped"
                LOGGER.info("[Zep] Applied Glass ontology (%s scope)", scope)
            except Exception as exc:  # pragma: no cover - network failure guard
                LOGGER.warning("[Zep] Failed to set ontology: %s", exc)

    def _parse_node_payload(self, node: EntityNode) -> tuple[str | None, dict[str, Any] | None]:
        """Extract JSON payload and identifier from an EntityNode.

        EntityNode stores JSON document data in the attributes field.
        """
        doc_id = node.uuid_
        payload: dict[str, Any] | None = None

        if node.attributes and isinstance(node.attributes, dict):
            payload = dict(node.attributes)

        if payload is not None and doc_id:
            payload = dict(payload)
            payload.setdefault("id", str(doc_id))

        return (str(doc_id) if doc_id else None, payload)

    def _parse_edge_payload(self, edge: EntityEdge) -> tuple[str | None, dict[str, Any] | None]:
        """Extract JSON payload and identifier from an EntityEdge.

        EntityEdge may have JSON data in attributes, or we construct from edge fields.
        """
        doc_id = edge.uuid_
        payload: dict[str, Any] | None = None

        if edge.attributes and isinstance(edge.attributes, dict):
            payload = dict(edge.attributes)
        else:
            # Fallback: construct minimal payload from edge fields
            payload = {
                "fact": edge.fact,
                "name": edge.name,
            }

        if payload is not None and doc_id:
            payload = dict(payload)
            payload.setdefault("id", str(doc_id))

        return (str(doc_id) if doc_id else None, payload)

    _ZEP_SEARCH_LIMIT = 50

    async def _search_documents(
        self,
        *,
        user_id: str,
        label: str,
        query: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Search JSON documents in the graph and filter by label."""
        search_filters = {"node_labels": [label]}
        zep_limit = min(self._ZEP_SEARCH_LIMIT, max(1, limit))

        try:
            result: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query=query or label,
                scope="nodes",
                search_filters=search_filters,
                limit=zep_limit,
            )
        except TypeError:
            # Older SDKs may not support search_filters; retry without them
            try:
                result = await self.client.graph.search(
                    user_id=user_id,
                    query=query or label,
                    scope="nodes",
                    limit=zep_limit,
                )
            except Exception as exc:
                LOGGER.error("[MemoryAdapter] Document search failed for %s: %s", label, exc)
                return []
        except Exception as exc:
            LOGGER.error("[MemoryAdapter] Document search failed for %s: %s", label, exc)
            return []

        # GraphSearchResults has edges, episodes, nodes - documents are typically in nodes
        # For document search with scope="documents", results are in nodes
        payloads: list[dict[str, Any]] = []

        if result.nodes:
            for node in result.nodes:
                _, payload = self._parse_node_payload(node)
                if not payload:
                    continue
                node_label = getattr(node, "label", None)
                payload_label = payload.get("label")
                if node_label and node_label != label and node_label not in (payload_label,):
                    continue
                if payload_label and payload_label != label:
                    continue
                payloads.append(payload)
        elif result.edges:
            # Fallback: sometimes documents might be returned as edges
            for edge in result.edges:
                _, payload = self._parse_edge_payload(edge)
                if not payload or payload.get("label") != label:
                    continue
                payloads.append(payload)

        return payloads

    async def _get_partner_node_uuid(self, *, user_id: str, partner_id_or_name: str, limit: int = 5) -> str | None:
        """Locate a partner node by id or display name."""
        needle = (partner_id_or_name or "").strip()
        if not needle:
            return None
        target = needle.lower()

        def _match_node(node: EntityNode) -> str | None:
            node_uuid, payload = self._parse_node_payload(node)
            if not payload or not node_uuid:
                return None
            partner_attr = (payload.get("partner_id") or "").lower()
            display_attr = (payload.get("display_name") or "").lower()
            if partner_attr == target or (display_attr and display_attr == target):
                return node_uuid
            return None

        try:
            result: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query=needle,
                scope="nodes",
                search_filters={"node_labels": ["Partner"]},
                limit=max(1, limit),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Partner search failed for %s/%s: %s", user_id, partner_id_or_name, exc)
            result = None

        if result and result.nodes:
            for node in result.nodes:
                match = _match_node(node)
                if match:
                    return match
            return str(result.nodes[0].uuid_)

        node_client = getattr(self.client.graph, "node", None)
        if not node_client:
            return None
        try:
            nodes = await node_client.get_by_user_id(user_id=user_id, limit=500)
        except Exception as exc:
            LOGGER.debug("[Zep] Partner node listing failed for %s: %s", user_id, exc)
            return None

        for node in nodes or []:
            labels = getattr(node, "labels", None) or []
            if "Partner" not in labels:
                continue
            match = _match_node(node)
            if match:
                return match
        return None

    async def get_user_profile_facts(self, *, user_id: str, limit: int = 50) -> list[str]:
        """Return all user profile facts via USER_HAS_PROFILE_FACT edges."""
        try:
            search_results: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query="user profile facts",
                scope="edges",
                search_filters={"edge_types": ["USER_HAS_PROFILE_FACT"]},
                limit=min(50, max(1, limit)),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to fetch user profile facts for %s: %s", user_id, exc)
            return []
        facts: list[str] = []
        for edge in search_results.edges or []:
            fact_text = getattr(edge, "fact", None) or getattr(edge, "content", None)
            if fact_text:
                facts.append(fact_text)
        return facts

    async def get_partner_profile_facts(
        self,
        *,
        user_id: str,
        partner_id_or_name: str,
        partner_uuid: str | None = None,
        limit: int = 50,
    ) -> list[str]:
        """Return accumulated partner profile facts."""
        partner_uuid = partner_uuid or await self._get_partner_node_uuid(
            user_id=user_id,
            partner_id_or_name=partner_id_or_name,
        )
        if not partner_uuid:
            return []
        try:
            search_results: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query="partner profile facts",
                scope="edges",
                search_filters={"edge_types": ["PARTNER_HAS_PROFILE_FACT"]},
                bfs_origin_node_uuids=[partner_uuid],
                limit=min(50, max(1, limit)),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to fetch partner facts for %s/%s: %s", user_id, partner_id_or_name, exc)
            return []
        facts: list[str] = []
        for edge in search_results.edges or []:
            fact_text = getattr(edge, "fact", None) or getattr(edge, "content", None)
            if fact_text:
                facts.append(fact_text)
        return facts

    async def _edge_source_payload(self, edge: EntityEdge) -> dict[str, Any] | None:
        """Load the payload for the ConversationFact node at the edge source."""
        raw_source = getattr(edge, "source_node", None) or getattr(edge, "source", None)
        if raw_source:
            if isinstance(raw_source, EntityNode):
                _, payload = self._parse_node_payload(raw_source)
                return payload
            if isinstance(raw_source, dict):
                return dict(raw_source)
        node_uuid = getattr(edge, "source_node_uuid", None)
        if not node_uuid:
            return None
        node_client = getattr(self.client.graph, "node", None)
        if not node_client:
            return None
        try:
            node = await node_client.get(uuid_=node_uuid)
        except Exception as exc:
            LOGGER.debug("[Zep] Unable to load node %s: %s", node_uuid, exc)
            return None
        _, payload = self._parse_node_payload(node)
        return payload

    async def _edge_target_payload(self, edge: EntityEdge) -> dict[str, Any] | None:
        """Load the payload for the ConversationFact node at the edge target."""
        raw_target = getattr(edge, "target_node", None) or getattr(edge, "target", None)
        if raw_target:
            if isinstance(raw_target, EntityNode):
                _, payload = self._parse_node_payload(raw_target)
                return payload
            if isinstance(raw_target, dict):
                return dict(raw_target)
        node_uuid = getattr(edge, "target_node_uuid", None)
        if not node_uuid:
            return None
        node_client = getattr(self.client.graph, "node", None)
        if not node_client:
            return None
        try:
            node = await node_client.get(uuid_=node_uuid)
        except Exception as exc:
            LOGGER.debug("[Zep] Unable to load node %s: %s", node_uuid, exc)
            return None
        _, payload = self._parse_node_payload(node)
        return payload

    async def get_user_facts_for_partner(
        self,
        *,
        user_id: str,
        partner_id_or_name: str,
        partner_uuid: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Return ConversationFact summaries tied to a partner via observed interactions."""
        partner_uuid = partner_uuid or await self._get_partner_node_uuid(
            user_id=user_id,
            partner_id_or_name=partner_id_or_name,
        )
        if not partner_uuid:
            return []

        edge_types = ["INTERACTION_OBSERVED_FACT", "FACT_OBSERVED_IN"]
        try:
            search_results: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query="user fact",
                scope="edges",
                search_filters={"edge_types": edge_types},
                bfs_origin_node_uuids=[partner_uuid],
                limit=min(50, max(1, limit * 2)),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to fetch user facts for %s/%s: %s", user_id, partner_id_or_name, exc)
            return []

        fact_entries: list[dict[str, Any]] = []
        for edge in search_results.edges or []:
            edge_name = getattr(edge, "name", "")
            if edge_name == "INTERACTION_OBSERVED_FACT":
                payload = await self._edge_target_payload(edge)
            else:
                payload = await self._edge_source_payload(edge)
            if not payload:
                continue
            if (payload.get("subject_type") or "").lower() != "user":
                continue
            summary = (payload.get("value") or "").strip()
            if not summary:
                continue
            fact_entries.append(
                {
                    "type": "ConversationFact",
                    "summary": summary,
                    "timestamp": payload.get("updated_at"),
                    "node_id": payload.get("id"),
                }
            )
            if len(fact_entries) >= limit:
                break

        return fact_entries

    async def get_interactions_with_partner(
        self,
        *,
        user_id: str,
        partner_id_or_name: str,
        partner_uuid: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return partner-linked Interaction nodes."""
        partner_uuid = partner_uuid or await self._get_partner_node_uuid(
            user_id=user_id,
            partner_id_or_name=partner_id_or_name,
        )
        if not partner_uuid:
            return []
        try:
            search_results: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query="interaction summary",
                scope="nodes",
                search_filters={"node_labels": ["Interaction"]},
                bfs_origin_node_uuids=[partner_uuid],
                limit=min(50, max(1, limit)),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to fetch interactions for %s/%s: %s", user_id, partner_id_or_name, exc)
            return []
        def _clean_text(value: Any) -> str:
            if not isinstance(value, str):
                return ""
            text = value.strip()
            if not text or text.lower() == "none":
                return ""
            return text

        def _clean_timestamp(value: Any) -> str | None:
            text = _clean_text(value)
            return text or None

        interactions: list[dict[str, Any]] = []
        for node in search_results.nodes or []:
            node_id, payload = self._parse_node_payload(node)
            if not payload:
                continue
            raw_summary = payload.get("interaction_summary") or payload.get("summary")
            if (not raw_summary or _clean_text(raw_summary) == "") and hasattr(node, "summary"):
                raw_summary = getattr(node, "summary", None)
            summary = _clean_text(raw_summary) or "Interaction noted"
            timestamp = (
                _clean_timestamp(payload.get("ended_at"))
                or _clean_timestamp(payload.get("started_at"))
                or getattr(node, "created_at", None)
            )

            entry: dict[str, Any] = {
                "node_id": node_id,
                "type": "Interaction",
                "summary": summary,
                "timestamp": timestamp,
            }
            entry.update(
                {
                    "thread_id": _clean_text(payload.get("thread_id")) or None,
                    "language_code": _clean_text(payload.get("language_code")) or None,
                    "started_at": _clean_timestamp(payload.get("started_at")),
                    "ended_at": _clean_timestamp(payload.get("ended_at")),
                    "interaction_summary": summary,
                }
            )
            interactions.append(entry)
        return interactions

    async def _facts_for_interactions(
        self,
        *,
        interaction_node_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Load fact nodes connected to a collection of Interaction nodes."""
        if not interaction_node_ids:
            return []
        node_client = getattr(self.client.graph, "node", None)
        if not node_client:
            return []

        fact_payloads: list[dict[str, Any]] = []

        for node_id in interaction_node_ids:
            if not node_id:
                continue
            try:
                edges = await node_client.get_edges(node_uuid=node_id)
            except Exception as exc:
                LOGGER.debug("[Zep] Unable to load edges for interaction %s: %s", node_id, exc)
                continue
            if not edges:
                continue
            for edge in edges:
                if edge.name != "FACT_OBSERVED_IN":
                    continue
                source_uuid = getattr(edge, "source_node_uuid", None)
                if not source_uuid:
                    continue
                try:
                    fact_node = await node_client.get(uuid_=source_uuid)
                except Exception as exc:
                    LOGGER.debug("[Zep] Unable to fetch fact node %s: %s", source_uuid, exc)
                    continue
                _, payload = self._parse_node_payload(fact_node)
                if payload:
                    fact_payloads.append(payload)
        return fact_payloads

    async def _graph_add_entries(
        self,
        user_id: str,
        entries: Iterable[GraphPayload] | None,
        *,
        thread_id: str | None = None,
    ) -> None:
        """Add structured entries to the graph."""
        if not entries:
            return
        payloads = []
        for entry in entries:
            if not entry:
                continue
            data = entry.to_dict()
            if not data:
                continue
            payloads.append(data)
        if not payloads:
            return

        for payload in payloads:
            try:
                result = await self.client.graph.add(
                    user_id=user_id,
                    type="json",
                    data=json.dumps(payload),
                )
            except Exception as exc:
                LOGGER.warning("[Zep] Failed to add graph entry %s: %s", payload.get("label"), exc)
                continue
            episode_id = self._episode_id_from_add_result(result)
            self._track_pending_episode(thread_id, episode_id)

    async def add_graph_document(
        self,
        *,
        user_id: str,
        payload: GraphPayload,
        thread_id: str | None = None,
    ) -> str | None:
        """Convenience helper for adding a single document payload."""
        data = payload.to_dict() if payload else None
        if not data:
            return None
        try:
            result = await self.client.graph.add(
                user_id=user_id,
                type="json",
                data=json.dumps(data),
            )
        except Exception as exc:
            LOGGER.warning("[Zep] Failed to add graph document: %s", exc)
            return None
        doc_id = self._episode_id_from_add_result(result)
        self._track_pending_episode(thread_id, doc_id)
        return doc_id

    async def delete_graph_document(self, *, user_id: str, document_id: str) -> bool:
        """Delete a graph document/episode by id."""
        if await self._delete_episode_uuid(user_id=user_id, episode_uuid=document_id):
            return True

        deleted_from_node = await self._delete_node_episodes(user_id=user_id, node_uuid=document_id)
        if deleted_from_node:
            return True

        LOGGER.debug("[Zep] Document %s not deleted for user %s", document_id, user_id)
        return False

    async def _delete_episode_uuid(self, *, user_id: str, episode_uuid: str) -> bool:
        episode_client = getattr(self.client.graph, "episode", None)
        delete_episode = getattr(episode_client, "delete", None) if episode_client else None
        if not callable(delete_episode):
            return False
        try:
            await delete_episode(uuid_=episode_uuid)
            LOGGER.debug("[Zep] Deleted episode %s for user %s", episode_uuid, user_id)
            return True
        except ApiError as exc:
            if getattr(exc, "status_code", None) == 404:
                LOGGER.debug("[Zep] Episode %s does not exist for user %s", episode_uuid, user_id)
                return False
            LOGGER.debug("[Zep] Episode delete failed for %s/%s: %s", user_id, episode_uuid, exc)
            return False
        except Exception as exc:
            LOGGER.debug("[Zep] Episode delete failed for %s/%s: %s", user_id, episode_uuid, exc)
            return False

    async def _delete_node_episodes(self, *, user_id: str, node_uuid: str) -> bool:
        node_client = getattr(self.client.graph, "node", None)
        get_episodes = getattr(node_client, "get_episodes", None) if node_client else None
        if not callable(get_episodes):
            return False
        try:
            response = await get_episodes(node_uuid=node_uuid)
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to fetch episodes for node %s/%s: %s", user_id, node_uuid, exc)
            return False

        episodes = (getattr(response, "episodes", None) or []) if response else []
        if not episodes:
            return False

        deleted_any = False
        for episode in episodes:
            episode_uuid = getattr(episode, "uuid_", None)
            if not episode_uuid:
                continue
            deleted = await self._delete_episode_uuid(user_id=user_id, episode_uuid=episode_uuid)
            deleted_any = deleted_any or deleted
        return deleted_any

    async def get_fact_node(self, *, node_uuid: str) -> dict[str, Any] | None:
        """Load a ConversationFact node directly by UUID."""
        if not node_uuid:
            return None
        node_client = getattr(self.client.graph, "node", None)
        get_node = getattr(node_client, "get", None) if node_client else None
        if not callable(get_node):
            return None
        try:
            node = await get_node(uuid_=node_uuid)
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to hydrate fact node %s: %s", node_uuid, exc)
            return None
        _, payload = self._parse_node_payload(node)
        return payload

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
            memory: ThreadContextResponse = await self.client.thread.get_user_context(
                thread_id=session_id,
                mode="basic",  # Use basic mode for lower latency (< 200ms)
            )

            # Parse the context block into structured data
            results = self._parse_context_block(memory.context)

            return results

        except Exception as e:
            LOGGER.error(f"Failed to retrieve from Zep: {e}", exc_info=True)
            return []

    async def list_conversation_memories(
        self,
        *,
        user_id: str,
        thread_id: str,
        conversation_end: datetime | None = None,
        query: str = "facts and information from recent conversation",
        limit: int = 50,
    ) -> tuple[list[dict[str, str]], bool]:
        """Return graph facts that belong to a specific conversation thread."""
        del conversation_end, query, limit
        if not user_id or not thread_id:
            return [], False

        normalized_thread = _safe_lower(thread_id)
        memories: list[dict[str, str]] = []

        def _append(item_id: str | None, label: str, value: str) -> None:
            if not item_id or not value:
                return
            memories.append(
                {
                    "id": item_id,
                    "label": label,
                    "value": value,
                }
            )

        interaction_nodes: list[dict[str, Any]] = []
        try:
            interactions = await self._search_documents(
                user_id=user_id,
                label="Interaction",
                query="interaction summary",
                limit=50,
            )
            for doc in interactions:
                if _safe_lower(doc.get("thread_id")) != normalized_thread:
                    continue
                interaction_nodes.append(doc)
        except Exception as exc:
            LOGGER.debug("[MemoryAdapter] Failed to fetch thread interactions: %s", exc)

        if interaction_nodes:
            node_ids = [str(doc.get("id") or "") for doc in interaction_nodes if doc.get("id")]
            try:
                thread_facts = await self._facts_for_interactions(interaction_node_ids=node_ids)
            except Exception as exc:
                LOGGER.debug("[MemoryAdapter] Failed to load facts for thread %s: %s", thread_id, exc)
                thread_facts = []
            for fact in thread_facts:
                label_seed = fact.get("key") or fact.get("subject_type") or "Fact"
                label = f"{label_seed} fact".title()
                _append(f"{fact.get('id')}::fact", label, fact.get("value") or "")

        for doc in interaction_nodes:
            doc_id = str(doc.get("id") or "")
            summary = (doc.get("interaction_summary") or doc.get("summary") or "").strip()
            if summary:
                _append(f"{doc_id}::summary", "Session summary", summary)

        return memories, False

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
                memory: ThreadContextResponse = await self.client.user.get_user_context(user_id=user_id)
                context = memory.context
            except Exception:
                # Fallback to graph search
                search_result: GraphSearchResults = await self.client.graph.search(
                    user_id=user_id,
                    query="user information, preferences, background, interests, and past topics",
                    scope="edges",
                    limit=20,
                )

                facts = []
                if search_result.edges:
                    for edge in search_result.edges:
                        if edge.fact:
                            valid_info = ""
                            if edge.valid_at:
                                valid_info = f" (since {edge.valid_at})"
                            facts.append(f"  - {edge.fact}{valid_info}")
                if not facts:
                    fallback_facts = await self.get_user_profile_facts(user_id=user_id, limit=50)
                    facts.extend(f"  - {text}" for text in fallback_facts)

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
                return await asyncio.wait_for(self._get_thread_context(thread_id), timeout=timeout)

            elif scope == "hybrid":
                # Balanced: user + thread contexts in parallel
                tasks = [
                    asyncio.wait_for(self._get_thread_context(thread_id), timeout=2.0),
                    # User context uses cache
                    asyncio.wait_for(self.get_user_context_block(user_id, use_cache=True), timeout=3.0),
                ]

                results = await asyncio.gather(*tasks, return_exceptions=True)

                thread_ctx = "" if isinstance(results[0], Exception) else results[0]
                user_ctx = "" if isinstance(results[1], Exception) else results[1]

                # Combine (partial success OK)
                if user_ctx and thread_ctx:
                    result: str = f"{user_ctx}\n\n{thread_ctx}"
                    return result
                return user_ctx or thread_ctx or ""  # type: ignore[return-value]

            else:
                LOGGER.warning(f"Unknown scope: {scope}, defaulting to thread")
                return await asyncio.wait_for(self._get_thread_context(thread_id), timeout=timeout)

        except asyncio.TimeoutError:
            LOGGER.warning(f"[Context] Timeout after {timeout}s for scope={scope}")
            return ""
        except Exception as e:
            LOGGER.error(f"[Context] Failed to get context: {e}")
            return ""

    async def _get_thread_context(self, thread_id: str) -> str:
        """Get thread-level context (current conversation only)."""
        try:
            memory: ThreadContextResponse = await self.client.thread.get_user_context(
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

    async def upsert_user_persona(
        self,
        *,
        user_id: str,
        native_languages: list[str],
        learning_languages: list[dict[str, str]],
        display_name: str | None = None,
    ) -> None:
        """Persist a UserPersona node plus language profiles."""
        persona_entry = build_user_persona_payload(
            user_id=user_id,
            display_name=display_name,
            native_languages=native_languages,
            learning_languages=learning_languages,
        )
        try:
            await self._graph_add_entries(user_id, [persona_entry])
            LOGGER.debug("[Zep] Upserted persona for %s", user_id)
        except Exception as exc:
            LOGGER.warning("Failed to upsert persona for %s: %s", user_id, exc)

    async def add_profile_facts(
        self,
        *,
        user_id: str,
        facts: list[dict[str, Any]],
    ) -> None:
        """Add automatically extracted profile facts."""
        if not user_id or not facts:
            return

        entries: list[GraphPayload] = []
        for fact in facts:
            key_raw = (fact.get("key") or "").strip()
            value = (fact.get("value") or "").strip()
            if not key_raw or not value:
                continue

            key = key_raw.lower()
            category = (fact.get("category") or "profile").strip() or "profile"
            updated_at = fact.get("updated_at")

            timestamp: datetime | None = None
            if isinstance(updated_at, datetime):
                timestamp = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=timezone.utc)
            elif isinstance(updated_at, (int, float)):
                timestamp = datetime.fromtimestamp(float(updated_at), tz=timezone.utc)
            elif isinstance(updated_at, str):
                try:
                    parsed = updated_at.replace("Z", "+00:00") if updated_at.endswith("Z") else updated_at
                    ts = datetime.fromisoformat(parsed)
                    timestamp = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
                except Exception:
                    timestamp = None

            entries.append(
                build_conversation_fact_payload(
                    key=key,
                    value=value,
                    category=category,
                    updated_at=timestamp,
                    subject_type="user",
                    subject_id=user_id,
                )
            )

        if not entries:
            return

        try:
            await self._graph_add_entries(user_id, entries)
            LOGGER.debug("[Zep] Added %s profile facts for %s", len(entries), user_id)
        except Exception as exc:
            LOGGER.warning("[Zep] Failed to add profile facts for %s: %s", user_id, exc)

    async def persist_conversation_insights(
        self,
        *,
        user_id: str,
        thread_id: str,
        insights: dict[str, Any],
        partner_id: str | None = None,
        language_code: str | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist extracted conversation highlights as interaction summaries."""
        if not user_id or not insights:
            return

        interaction_entries = insights.get("interaction_insights") or []
        summary = ""
        topics: list[str] = []
        if interaction_entries:
            first = interaction_entries[0]
            if isinstance(first, str):
                summary = first.strip()
            for entry in interaction_entries[1:]:
                if not isinstance(entry, str):
                    continue
                text = entry.strip()
                if text:
                    topics.append(text)
        if topics:
            topics = list(dict.fromkeys(topics))[:5]
        if summary or topics:
            try:
                await self.record_interaction(
                    user_id=user_id,
                    thread_id=thread_id,
                    partner_id=partner_id,
                    language_code=language_code,
                    summary=summary or None,
                    topics=topics or None,
                    started_at=started_at,
                    ended_at=ended_at,
                )
            except Exception as exc:
                LOGGER.debug("[Zep] Failed to record interaction summary for %s: %s", user_id, exc)

    async def search_profile_facts(
        self,
        *,
        user_id: str,
        user_hint: str | None = None,
        last_partner_message: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Search the graph for stored profile facts."""
        if not user_id:
            return []

        hint = (user_hint or "").strip()
        message = (last_partner_message or "").strip()
        query_parts: list[str] = []
        if hint:
            query_parts.append(f"user_hint: {hint}")
        if message:
            query_parts.append(f"partner_said: {message}")
        if not query_parts:
            query_parts.append("important profile facts about the user as a person")
        query = " ".join(query_parts)

        try:
            search_result: GraphSearchResults = await self.client.graph.search(
                user_id=user_id,
                query=query,
                scope="nodes",
                limit=max(limit, 5),
            )
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to search profile facts for %s: %s", user_id, exc)
            return []

        facts: list[dict[str, Any]] = []
        nodes = search_result.nodes or []
        for node in nodes:
            _, payload = self._parse_node_payload(node)
            if not payload:
                continue
            node_label = getattr(node, "label", None)
            payload_label = (payload.get("label") or "").strip()
            if node_label and node_label != "ConversationFact":
                continue
            if payload_label and payload_label != "ConversationFact":
                continue
            facts.append(
                {
                    "id": payload.get("id"),
                    "key": payload.get("key"),
                    "value": payload.get("value"),
                    "category": payload.get("category"),
                    "updated_at": payload.get("updated_at"),
                }
            )

        facts.sort(key=lambda item: _parse_iso_to_epoch(item.get("updated_at")), reverse=True)
        return facts[:limit]

    async def upsert_partner_profile(
        self,
        *,
        user_id: str,
        partner_profile: dict[str, object],
    ) -> None:
        """Persist Partner metadata linked to the user."""
        partner_id = (
            partner_profile.get("partner_id") if isinstance(partner_profile, dict) else None
        ) or partner_profile.get("id")
        if not partner_id:
            LOGGER.debug("[Zep] Skipping partner upsert with missing ID for %s", user_id)
            return

        notes = partner_profile.get("notes") or partner_profile.get("description")
        entry = build_partner_payload(
            user_id=user_id,
            partner_id=str(partner_id).lower(),
            name=partner_profile.get("name"),
            notes=notes,
            relation_to_user=partner_profile.get("relation_to_user"),
        )
        try:
            await self._graph_add_entries(user_id, [entry])
            LOGGER.debug("[Zep] Upserted partner profile for %s partner=%s", user_id, partner_id)
        except Exception as exc:
            LOGGER.warning("Failed to upsert partner profile for %s: %s", user_id, exc)

    async def add_feedback_record(
        self,
        *,
        user_id: str,
        record: dict[str, object],
    ) -> None:
        """Feedback persistence is disabled for the knowledge graph."""
        LOGGER.debug("[Zep] Skipping feedback persistence for %s", user_id)

    async def list_feedback_records(
        self,
        *,
        user_id: str,
        language_code: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Feedback persistence is disabled; always return an empty list."""
        return []

    async def delete_feedback_record(self, user_id: str, record_id: str) -> bool:
        """Feedback records are not stored in the graph."""
        LOGGER.debug("[Zep] Ignoring delete for feedback record %s", record_id)
        return False

    async def record_interaction(
        self,
        *,
        user_id: str,
        thread_id: str,
        partner_id: str | None,
        language_code: str | None,
        summary: str | None = None,
        topics: list[str] | None = None,
        started_at: float | None = None,
        ended_at: float | None = None,
    ) -> None:
        """Persist interaction metadata for analytics/debugging."""
        entry = build_interaction_payload(
            user_id=user_id,
            thread_id=thread_id,
            language_code=language_code,
            summary=summary,
            topics=topics,
            started_at=started_at,
            ended_at=ended_at,
            partner_id=partner_id,
        )
        stored = False
        try:
            await self._graph_add_entries(user_id, [entry])
            stored = True
        except Exception as exc:
            LOGGER.debug("[Zep] Failed to record interaction for %s: %s", user_id, exc)
        if stored:
            preview = (summary or "").strip()
            LOGGER.info(
                "[Zep] Recorded interaction for %s partner=%s summary=%s",
                user_id,
                partner_id or "none",
                (preview[:80] + "...") if len(preview) > 80 else preview or "(empty)",
            )

    async def get_partner_context(
        self,
        *,
        user_id: str,
        partner_id: str,
        limit: int = 5,
    ) -> str:
        """Return recent interaction/fact snippets for a partner with minimal queries."""
        if not user_id or not partner_id:
            return ""

        partner_uuid = await self._get_partner_node_uuid(user_id=user_id, partner_id_or_name=partner_id)
        if not partner_uuid:
            LOGGER.info("[Zep] No partner node for %s/%s", user_id, partner_id)
            return ""

        facts_task = asyncio.create_task(
            self.get_user_facts_for_partner(
                user_id=user_id,
                partner_id_or_name=partner_id,
                partner_uuid=partner_uuid,
                limit=limit,
            )
        )
        interactions_task = asyncio.create_task(
            self.get_interactions_with_partner(
                user_id=user_id,
                partner_id_or_name=partner_id,
                partner_uuid=partner_uuid,
                limit=limit,
            )
        )

        facts, interactions = await asyncio.gather(facts_task, interactions_task, return_exceptions=False)

        combined: list[tuple[float, str]] = []
        for entry in facts:
            summary = entry.get("summary")
            if not summary:
                continue
            timestamp = entry.get("timestamp")
            stamp = timestamp.split("T")[0] if isinstance(timestamp, str) and timestamp else ""
            line = f"- {stamp}: [Fact] {summary}" if stamp else f"- [Fact] {summary}"
            combined.append((_parse_iso_to_epoch(timestamp), line))

        for interaction in interactions:
            summary = interaction.get("summary") or "Interaction noted"
            timestamp = interaction.get("timestamp") or interaction.get("ended_at") or interaction.get("started_at")
            stamp = timestamp.split("T")[0] if isinstance(timestamp, str) and timestamp else ""
            line = f"- {stamp}: [Interaction] {summary}" if stamp else f"- [Interaction] {summary}"
            combined.append((_parse_iso_to_epoch(timestamp), line))

        if not combined:
            LOGGER.info("[Zep] No partner context for %s/%s", user_id, partner_id)
            return ""

        combined.sort(key=lambda item: item[0], reverse=True)
        context_lines = [line for _, line in combined[:limit]]
        context_blob = "\n".join(context_lines)

        preview = context_blob[:500].replace("\n", "\\n")
        LOGGER.info(
            "[Zep] Partner context for %s/%s (%d chars): %s%s",
            user_id,
            partner_id,
            len(context_blob),
            preview,
            "..." if len(context_blob) > 500 else "",
        )
        return context_blob

    async def add_conversation_messages(
        self,
        thread_id: str,
        user_id: str,
        messages: list[dict],
        session_start_time: float | None = None,
        participants: dict[str, dict[str, Any]] | None = None,
        return_context: bool = False,
    ) -> str | None:
        """Add conversation messages to Zep thread.

        Zep will automatically extract facts and entities from these messages
        to build the user's knowledge graph.

        Including participant metadata and timestamps improves Zep's graph construction
        and temporal understanding.

        Args:
            thread_id: Thread/session ID
            user_id: User ID
            messages: List of message dicts containing text, source, and identity metadata
            session_start_time: Optional session start epoch time for timestamps
            participants: Optional mapping of participant IDs to minimal metadata
        """
        if not messages:
            return None

        try:
            from zep_cloud.types import Message
            from datetime import datetime, timezone

            # Convert to Zep format
            zep_messages = []
            participant_map = participants or {}
            user_participant = participant_map.get("user", {})
            glass_participant = participant_map.get("glass", {})
            default_partner = participant_map.get("partner", {})

            user_msg_count = partner_msg_count = coach_msg_count = 0

            for idx, msg in enumerate(messages):
                message_role = (msg.get("role") or "").lower()
                speaker_type = (msg.get("speaker_type") or message_role).lower()
                partner_id = msg.get("partner_id")
                if isinstance(partner_id, str):
                    partner_id = partner_id.lower()
                content = msg.get("text", "")

                if not content:
                    continue

                assistant_type = msg.get("assistant_type")
                target_language = msg.get("target_language")
                native_language = msg.get("native_language")

                is_user_mic = speaker_type == "user" or message_role == "user"
                is_glass = speaker_type == "assistant" or message_role == "assistant"
                is_partner = speaker_type == "partner" or message_role == "partner"
                mode = (msg.get("mode") or "").lower()
                is_ai_partner = is_partner and mode == "roleplay"
                is_real_partner = is_partner and mode == "live_call"

                if is_glass:
                    coach_msg_count += 1
                elif is_user_mic:
                    user_msg_count += 1
                elif is_partner:
                    partner_msg_count += 1

                participant = None
                if partner_id and partner_id in participant_map:
                    participant = participant_map[partner_id]
                elif is_partner:
                    participant = default_partner
                elif is_user_mic:
                    participant = user_participant
                elif is_glass:
                    participant = glass_participant

                speaker_name = (participant or {}).get("name")

                # Format Glass feedback content to clearly distinguish from conversation
                if is_glass:
                    if not content.startswith("["):
                        content = f"[Learning Feedback] {content}"

                # Determine role and name for Zep
                zep_role = "assistant" if is_glass else "user"
                if is_user_mic:
                    name = speaker_name or user_participant.get("name") or "You"
                elif is_glass:
                    name = speaker_name or glass_participant.get("name") or "Learning Coach"
                elif is_partner or is_ai_partner:
                    name = speaker_name or (participant or {}).get("name") or default_partner.get("name") or "Partner"
                else:
                    name = speaker_name or default_partner.get("name") or "Partner"

                # Calculate timestamp for temporal understanding
                # Zep docs: "Setting created_at is important for accurate temporal understanding"
                created_at = None
                timestamp = msg.get("timestamp")
                if isinstance(timestamp, (int, float)):
                    created_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                elif session_start_time:
                    # Approximate timestamp based on message order
                    msg_epoch = session_start_time + (idx * 5)
                    created_at = datetime.fromtimestamp(msg_epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")

                # Build metadata for better context understanding
                metadata: dict[str, Any] = {}
                if partner_id is not None:
                    metadata["partner_id"] = partner_id
                if message_role:
                    metadata["role"] = message_role
                if msg.get("language"):
                    metadata["message_language"] = msg["language"]
                if speaker_type:
                    metadata["speaker_type"] = speaker_type
                if assistant_type:
                    metadata["assistant_type"] = assistant_type
                if target_language:
                    metadata["target_language"] = target_language
                if native_language:
                    metadata["native_language"] = native_language

                # Add role-specific metadata
                if is_user_mic:
                    # User (learner) metadata
                    metadata["is_learner"] = True
                    metadata["learning_context"] = True
                elif is_glass:
                    # Glass (Learning Coach) metadata - distinguish from conversation
                    metadata["type"] = "feedback"
                    metadata["is_feedback"] = True
                    metadata["not_conversation"] = True  # Not part of actual conversation
                    # Try to link to target utterance
                    if msg.get("utterance_id"):
                        metadata["target_utterance_id"] = msg["utterance_id"]
                elif is_ai_partner:
                    metadata["is_ai_partner"] = True
                    metadata["mode"] = "roleplay"
                elif is_real_partner:
                    metadata["is_real_partner"] = True
                    metadata["mode"] = "live_call"

                msg_kwargs = {
                    "role": zep_role,
                    "content": content,
                    "name": name,
                }
                if created_at:
                    msg_kwargs["created_at"] = created_at
                if speaker_name:
                    metadata["display_name"] = speaker_name
                if metadata:
                    msg_kwargs["metadata"] = metadata

                zep_msg = Message(**msg_kwargs)
                zep_messages.append(zep_msg)

                # Log message structure for debugging
                LOGGER.debug(
                    f"[Zep] Adding message - role={zep_role}, name={name}, "
                    f"content_preview={content[:50]}..., metadata={metadata}"
                )

            if zep_messages:
                # Log message composition summary
                user_count = user_msg_count
                partner_count = partner_msg_count
                coach_count = coach_msg_count
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
                        msg.content = msg.content[: MAX_MESSAGE_LENGTH - 3] + "..."

                # Send in batches of 30
                context_block: str | None = None
                total_messages = len(zep_messages)
                for i in range(0, total_messages, MAX_MESSAGES_PER_BATCH):
                    batch = zep_messages[i : i + MAX_MESSAGES_PER_BATCH]
                    is_last_batch = (i + len(batch)) >= total_messages
                    request_context = return_context and is_last_batch
                    response = await self.client.thread.add_messages(
                        thread_id=thread_id,
                        messages=batch,
                        ignore_roles=["assistant"],
                        return_context=request_context,
                    )
                    if request_context and response:
                        context_candidate = getattr(response, "context", None)
                        if not context_candidate and isinstance(response, dict):
                            context_candidate = response.get("context")
                        if context_candidate:
                            context_block = context_candidate
                    LOGGER.info(
                        f"Added {len(batch)} messages to Zep thread {thread_id} (batch {i // MAX_MESSAGES_PER_BATCH + 1})"
                    )

                LOGGER.info(f"✅ Total {len(zep_messages)} messages added to Zep thread {thread_id}")

                if zep_messages and zep_messages[0].created_at:
                    LOGGER.debug("⏰ Messages include timestamps for temporal understanding")
                return context_block
        except Exception as e:
            LOGGER.error(f"Failed to add messages to Zep: {e}", exc_info=True)
        return None

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
