"""Add explicit partner kind column."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251215_partner_kind"
down_revision = "20251212_drop_thread_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_partners",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="roleplay"),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE conversation_partners
            SET kind = CASE
                WHEN (extra_metadata ->> 'type') = 'live_call' THEN 'live_call'
                WHEN voice_id IS NULL OR voice_id = '' THEN 'live_call'
                ELSE 'roleplay'
            END
            """
        )
    )
    op.alter_column("conversation_partners", "kind", server_default=None)


def downgrade() -> None:
    op.drop_column("conversation_partners", "kind")
