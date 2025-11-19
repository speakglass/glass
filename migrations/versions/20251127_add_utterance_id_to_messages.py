"""Add utterance_id to conversation messages."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251127_add_utterance_id"
down_revision = "85ce880fe522"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_messages",
        sa.Column("utterance_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_conversation_messages_utterance_id",
        "conversation_messages",
        ["utterance_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_conversation_messages_utterance_id", table_name="conversation_messages")
    op.drop_column("conversation_messages", "utterance_id")
