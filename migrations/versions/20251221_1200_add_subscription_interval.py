"""Add subscription_interval to account_users.

Revision ID: 20251221_1200_add_subscription_interval
Revises: 20251220_remove_bonus_minutes
Create Date: 2025-12-21 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251221_1200_add_subscription_interval"
down_revision = "20251220_remove_bonus_minutes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "account_users",
        sa.Column("subscription_interval", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("account_users", "subscription_interval")
