"""Remove unused bonus_minutes column from account_users."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251220_drop_bonus_minutes"
down_revision = "20251215_partner_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("account_users", "bonus_minutes")


def downgrade() -> None:
    op.add_column(
        "account_users",
        sa.Column("bonus_minutes", sa.Integer(), nullable=True),
    )
