"""remove_keywords_entities

Revision ID: 9c26f985f972
Revises: 9ed2c6ba0ccc
Create Date: 2025-11-21 01:46:51.469797

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c26f985f972"
down_revision: Union[str, None] = "9ed2c6ba0ccc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove keywords and entities columns from memory_records."""
    # These fields are no longer needed with simplified semantic search
    op.drop_column("memory_records", "entities")
    op.drop_column("memory_records", "keywords")


def downgrade() -> None:
    """Restore keywords and entities columns."""
    from sqlalchemy.dialects import postgresql

    op.add_column("memory_records", sa.Column("keywords", postgresql.ARRAY(sa.String(64)), nullable=True))
    op.add_column("memory_records", sa.Column("entities", postgresql.JSON(), nullable=True))
