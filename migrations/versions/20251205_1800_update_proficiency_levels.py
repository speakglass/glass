"""Normalize legacy proficiency levels and rename column to language_level."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251205_langlvl"
down_revision = "6b21e2a9c883"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE account_users SET proficiency = 'zero' WHERE proficiency = 'cant_read';")
    op.execute("UPDATE account_users SET proficiency = 'intermediate' WHERE proficiency = 'can_read';")
    op.alter_column(
        "account_users",
        "proficiency",
        new_column_name="language_level",
        existing_type=sa.String(length=32),
    )


def downgrade() -> None:
    op.alter_column(
        "account_users",
        "language_level",
        new_column_name="proficiency",
        existing_type=sa.String(length=32),
    )
    op.execute("UPDATE account_users SET proficiency = 'cant_read' WHERE proficiency = 'zero';")
    op.execute("UPDATE account_users SET proficiency = 'can_read' WHERE proficiency = 'intermediate';")
