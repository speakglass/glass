"""Structured payload builders for Zep graph data."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Sequence


def _stringify(value: Any | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_identifier(value: str | None) -> str | None:
    text = _stringify(value)
    if not text:
        return None
    return text.lower()


def _timestamp_to_iso(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    try:
        dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return None


@dataclass(slots=True)
class GraphEntity:
    label: str
    attributes: dict[str, str | None]
    key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = {"label": self.label}
        for attr, value in self.attributes.items():
            if value is None:
                continue
            payload[attr] = value
        if self.key:
            payload["key"] = self.key
        return payload


@dataclass(slots=True)
class GraphEdgeEndpoint:
    label: str
    key: str | None = None
    match: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"label": self.label}
        if self.key:
            payload["key"] = self.key
        if self.match:
            payload["match"] = {k: v for k, v in self.match.items() if v}
        return payload


@dataclass(slots=True)
class GraphEdge:
    name: str
    source: GraphEdgeEndpoint
    target: GraphEdgeEndpoint
    fact: str | None = None
    attributes: dict[str, str | None] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "source": self.source.to_dict(),
            "target": self.target.to_dict(),
        }
        if self.fact:
            payload["fact"] = self.fact
        attrs = {k: v for k, v in self.attributes.items() if v is not None}
        if attrs:
            payload["attributes"] = attrs
        return payload


@dataclass(slots=True)
class GraphPayload:
    """Container for entity and edge definitions."""

    entities: list[GraphEntity] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if self.entities:
            payload["entities"] = [entity.to_dict() for entity in self.entities]
        if self.edges:
            payload["edges"] = [edge.to_dict() for edge in self.edges]
        return payload


def _entity_key(prefix: str, identifier: str | None) -> str | None:
    ident = _clean_identifier(identifier)
    if not ident:
        return None
    return f"{prefix}:{ident}"


def _fact_entity_key(subject_type: str, subject_id: str | None, key: str | None, value: str) -> str:
    base = f"{subject_type}:{subject_id or 'unknown'}:{key or ''}:{value}"
    digest = hashlib.sha1(base.encode("utf-8"), usedforsecurity=False).hexdigest()
    return f"fact:{digest}"


def _persona_endpoint(user_id: str) -> GraphEdgeEndpoint:
    return GraphEdgeEndpoint(label="UserPersona", match={"user_id": _clean_identifier(user_id) or ""})


def _partner_endpoint(partner_id: str) -> GraphEdgeEndpoint:
    return GraphEdgeEndpoint(label="Partner", match={"partner_id": _clean_identifier(partner_id) or ""})


def _interaction_endpoint(
    *,
    interaction_key: str | None,
    thread_id: str | None,
) -> GraphEdgeEndpoint:
    return GraphEdgeEndpoint(
        label="Interaction",
        key=interaction_key,
        match={"thread_id": _clean_identifier(thread_id)} if thread_id else None,
    )


def build_user_persona_payload(
    *,
    user_id: str,
    display_name: str | None = None,
    native_languages: Sequence[str],
    learning_languages: Sequence[dict[str, Any]] | None = None,
    traits: Sequence[str] | None = None,
) -> GraphPayload:
    del native_languages, learning_languages, traits  # Not stored in ontology
    attributes = {
        "user_id": _clean_identifier(user_id),
        "display_name": _stringify(display_name),
    }
    entity = GraphEntity(
        label="UserPersona",
        attributes=attributes,
        key=_entity_key("user", user_id),
    )
    return GraphPayload(entities=[entity])


def build_partner_payload(
    *,
    user_id: str,
    partner_id: str,
    name: str | None,
    notes: str | None = None,
    relation_to_user: str | None = None,
) -> GraphPayload:
    del user_id, notes  # Partner nodes are per-user but keyed by partner_id already
    attributes = {
        "partner_id": _clean_identifier(partner_id),
        "display_name": _stringify(name),
        "relation_to_user": _stringify(relation_to_user),
    }
    entity = GraphEntity(
        label="Partner",
        attributes=attributes,
        key=_entity_key("partner", partner_id),
    )
    return GraphPayload(entities=[entity])


def build_interaction_payload(
    *,
    user_id: str,
    thread_id: str,
    language_code: str | None,
    summary: str | None = None,
    topics: Sequence[str] | None = None,
    started_at: float | None = None,
    ended_at: float | None = None,
    partner_id: str | None = None,
) -> GraphPayload:
    summary_text = _stringify(summary)
    topics_list: list[str] = []
    if topics:
        for topic in topics:
            topic_text = _stringify(topic)
            if topic_text:
                topics_list.append(topic_text)
    if topics_list:
        topics_text = ", ".join(dict.fromkeys(topics_list))
        if summary_text:
            summary_text = f"{summary_text}\nTopics: {topics_text}"
        else:
            summary_text = f"Topics: {topics_text}"

    attributes = {
        "thread_id": _clean_identifier(thread_id),
        "language_code": _stringify(language_code),
        "started_at": _timestamp_to_iso(started_at),
        "ended_at": _timestamp_to_iso(ended_at),
        "interaction_summary": summary_text,
    }
    interaction_key = _entity_key("interaction", thread_id)
    entity = GraphEntity(label="Interaction", attributes=attributes, key=interaction_key)

    edges: list[GraphEdge] = [
        GraphEdge(
            name="USER_HAS_INTERACTION",
            source=_persona_endpoint(user_id),
            target=_interaction_endpoint(interaction_key=interaction_key, thread_id=thread_id),
            fact=f"User {user_id} participated in {thread_id}",
        )
    ]
    partner_ref = _clean_identifier(partner_id)
    if partner_ref:
        edges.append(
            GraphEdge(
                name="PARTNER_PARTICIPATED_IN",
                source=_partner_endpoint(partner_ref),
                target=_interaction_endpoint(interaction_key=interaction_key, thread_id=thread_id),
                fact=f"Partner {partner_ref} participated in {thread_id}",
            )
        )

    return GraphPayload(entities=[entity], edges=edges)


def build_conversation_fact_payload(
    *,
    value: str,
    subject_type: str,
    subject_id: str | None,
    key: str | None = None,
    category: str | None = None,
    updated_at: datetime | None = None,
    interaction_thread_id: str | None = None,
    interaction_key: str | None = None,
) -> GraphPayload:
    """Create payload for an extracted conversation fact."""
    subject = (subject_type or "").lower().strip()
    subject_identifier = _clean_identifier(subject_id)
    if subject not in {"user", "partner"} or not subject_identifier:
        return GraphPayload()

    value_text = _stringify(value)
    if not value_text:
        return GraphPayload()

    timestamp = (updated_at or datetime.now(timezone.utc)).isoformat()
    fact_entity_key = _fact_entity_key(subject, subject_identifier, key, value_text)
    attributes = {
        "key": _stringify(key),
        "value": value_text,
        "category": _stringify(category) or "profile",
        "updated_at": timestamp,
        "subject_type": subject,
        "subject_id": subject_identifier,
    }
    entity = GraphEntity(label="ConversationFact", attributes=attributes, key=fact_entity_key)

    edges: list[GraphEdge] = []
    if subject == "user":
        edges.append(
            GraphEdge(
                name="USER_HAS_PROFILE_FACT",
                source=_persona_endpoint(subject_identifier),
                target=GraphEdgeEndpoint(label="ConversationFact", key=fact_entity_key),
                fact=f"User {subject_identifier} fact: {value_text}",
            )
        )
    else:
        edges.append(
            GraphEdge(
                name="PARTNER_HAS_PROFILE_FACT",
                source=_partner_endpoint(subject_identifier),
                target=GraphEdgeEndpoint(label="ConversationFact", key=fact_entity_key),
                fact=f"Partner {subject_identifier} fact: {value_text}",
            )
        )

    interaction_ref = interaction_key or (
        _entity_key("interaction", interaction_thread_id) if interaction_thread_id else None
    )
    if interaction_ref or interaction_thread_id:
        interaction_endpoint_for_target = _interaction_endpoint(
            interaction_key=interaction_ref,
            thread_id=interaction_thread_id,
        )
        edges.append(
            GraphEdge(
                name="FACT_OBSERVED_IN",
                source=GraphEdgeEndpoint(label="ConversationFact", key=fact_entity_key),
                target=interaction_endpoint_for_target,
                fact=f"Fact observed in {interaction_thread_id or interaction_ref}",
            )
        )
        edges.append(
            GraphEdge(
                name="INTERACTION_OBSERVED_FACT",
                source=_interaction_endpoint(interaction_key=interaction_ref, thread_id=interaction_thread_id),
                target=GraphEdgeEndpoint(label="ConversationFact", key=fact_entity_key),
                fact=f"Interaction {interaction_thread_id or interaction_ref} observed fact",
            )
        )

    return GraphPayload(entities=[entity], edges=edges)
