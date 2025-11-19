"""Remove legacy thread_id column from memory records."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251212_drop_thread_id"
down_revision = "20251211_mem_conv_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_memory_records_thread_id"), table_name="memory_records")
    op.drop_column("memory_records", "thread_id")


def downgrade() -> None:
    op.add_column("memory_records", sa.Column("thread_id", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_memory_records_thread_id"), "memory_records", ["thread_id"], unique=False)
