"""Add memory insights to conversations."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251206_memory_insights"
down_revision = "20251205_langlvl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "account_conversations",
        sa.Column("memory_insights", sa.JSON(none_as_null=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("account_conversations", "memory_insights")
