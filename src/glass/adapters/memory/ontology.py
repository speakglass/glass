"""Deeptrue slim ontology for Zep v3."""

from __future__ import annotations

from pydantic import Field

from zep_cloud import EntityEdgeSourceTarget
from zep_cloud.external_clients.ontology import EdgeModel, EntityModel, EntityText


# Entities


class UserPersonaEntity(EntityModel):
    """Root persona node for each AppUser."""

    user_id: EntityText = Field(
        description="Stable identifier for the AppUser.",
        default=None,
    )
    display_name: EntityText = Field(
        description="Display name for the user (if available).",
        default=None,
    )


class PartnerEntity(EntityModel):
    """Live or roleplay partner metadata."""

    partner_id: EntityText = Field(
        description="Partner identifier.",
        default=None,
    )
    display_name: EntityText = Field(
        description="Human-readable name of the partner.",
        default=None,
    )
    relation_to_user: EntityText = Field(
        description="How the partner relates to the user (live_call, roleplay, etc.).",
        default=None,
    )


class ConversationFactEntity(EntityModel):
    """Durable fact extracted from a conversation (user or partner specific)."""

    key: EntityText = Field(
        description="Optional short label for the fact (goal, routine, etc.).",
        default=None,
    )
    value: EntityText = Field(
        description="Fact value written in the user's native language if possible.",
        default=None,
    )
    category: EntityText = Field(
        description="Loose grouping: profile, background, preference, goal, etc.",
        default=None,
    )
    updated_at: EntityText = Field(
        description="ISO timestamp when the fact was last confirmed or mentioned.",
        default=None,
    )
    subject_type: EntityText = Field(
        description="Owner type for this fact (user or partner).",
        default=None,
    )
    subject_id: EntityText = Field(
        description="Identifier for the subject (user_id or partner_id).",
        default=None,
    )


class InteractionEntity(EntityModel):
    """Summary of a single practice interaction."""

    thread_id: EntityText = Field(
        description="Thread or session identifier.",
        default=None,
    )
    language_code: EntityText = Field(
        description="Language practiced during the interaction (ISO 639-1).",
        default=None,
    )
    started_at: EntityText = Field(
        description="ISO timestamp when the interaction began.",
        default=None,
    )
    ended_at: EntityText = Field(
        description="ISO timestamp when the interaction ended.",
        default=None,
    )
    interaction_summary: EntityText = Field(
        description="Brief summary of the session.",
        default=None,
    )
    topics: EntityText = Field(
        description="Comma-separated list of discussed topics.",
        default=None,
    )


# Edges


class UserHasProfileFactEdge(EdgeModel):
    """Connect a UserPersona to one of its profile facts."""


class UserHasInteractionEdge(EdgeModel):
    """Connect a UserPersona to an interaction."""


class PartnerParticipatedInEdge(EdgeModel):
    """Connect a partner to an interaction they joined."""


class PartnerHasProfileFactEdge(EdgeModel):
    """Connect a Partner node to one of its profile facts."""


class FactObservedInEdge(EdgeModel):
    """Connect a ConversationFact to the Interaction where it was observed."""


class InteractionObservedFactEdge(EdgeModel):
    """Connect an Interaction node back to the ConversationFact it captured."""


GLASS_ENTITY_DEFINITIONS = {
    "UserPersona": UserPersonaEntity,
    "Partner": PartnerEntity,
    "ConversationFact": ConversationFactEntity,
    "Interaction": InteractionEntity,
}

GLASS_EDGE_DEFINITIONS = {
    "USER_HAS_PROFILE_FACT": (
        UserHasProfileFactEdge,
        [EntityEdgeSourceTarget(source="UserPersona", target="ConversationFact")],
    ),
    "PARTNER_HAS_PROFILE_FACT": (
        PartnerHasProfileFactEdge,
        [EntityEdgeSourceTarget(source="Partner", target="ConversationFact")],
    ),
    "USER_HAS_INTERACTION": (
        UserHasInteractionEdge,
        [EntityEdgeSourceTarget(source="UserPersona", target="Interaction")],
    ),
    "PARTNER_PARTICIPATED_IN": (
        PartnerParticipatedInEdge,
        [EntityEdgeSourceTarget(source="Partner", target="Interaction")],
    ),
    "FACT_OBSERVED_IN": (
        FactObservedInEdge,
        [EntityEdgeSourceTarget(source="ConversationFact", target="Interaction")],
    ),
    "INTERACTION_OBSERVED_FACT": (
        InteractionObservedFactEdge,
        [EntityEdgeSourceTarget(source="Interaction", target="ConversationFact")],
    ),
}


def get_glass_entity_definitions() -> dict[str, type[EntityModel]]:
    """Return a fresh copy of the entity definitions."""
    return dict(GLASS_ENTITY_DEFINITIONS)


def get_glass_edge_definitions() -> dict[str, tuple[type[EdgeModel], list[EntityEdgeSourceTarget]]]:
    """Return a fresh copy of the edge definitions."""
    return {
        name: (model, list(targets))
        for name, (model, targets) in GLASS_EDGE_DEFINITIONS.items()
    }


def build_glass_ontology() -> tuple[
    dict[str, type[EntityModel]],
    dict[str, tuple[type[EdgeModel], list[EntityEdgeSourceTarget]]],
]:
    """Convenience helper for callers needing both entity and edge maps."""
    return get_glass_entity_definitions(), get_glass_edge_definitions()


__all__ = [
    "GLASS_ENTITY_DEFINITIONS",
    "GLASS_EDGE_DEFINITIONS",
    "build_glass_ontology",
    "get_glass_edge_definitions",
    "get_glass_entity_definitions",
    "UserPersonaEntity",
    "PartnerEntity",
    "ConversationFactEntity",
    "InteractionEntity",
    "UserHasProfileFactEdge",
    "UserHasInteractionEdge",
    "PartnerParticipatedInEdge",
    "PartnerHasProfileFactEdge",
    "FactObservedInEdge",
    "InteractionObservedFactEdge",
]
