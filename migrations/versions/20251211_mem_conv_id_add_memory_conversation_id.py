"""Add conversation_id to memory records."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251211_mem_conv_id"
down_revision = "20251211_billing_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "memory_records",
        sa.Column("conversation_id", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_memory_records_conversation_id",
        "memory_records",
        "account_conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_memory_records_conversation_id"),
        "memory_records",
        ["conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_memory_records_conversation_id"), table_name="memory_records")
    op.drop_constraint("fk_memory_records_conversation_id", "memory_records", type_="foreignkey")
    op.drop_column("memory_records", "conversation_id")
