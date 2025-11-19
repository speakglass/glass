"""Add Stripe billing columns to account_users."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251211_billing_columns"
down_revision = "20251127_add_utterance_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "account_users",
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "account_users",
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "account_users",
        sa.Column("subscription_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "account_users",
        sa.Column("subscription_plan", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "account_users",
        sa.Column("subscription_current_period_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "account_users",
        sa.Column("billing_exempt", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_unique_constraint(
        "uq_account_users_stripe_customer_id",
        "account_users",
        ["stripe_customer_id"],
    )
    op.create_unique_constraint(
        "uq_account_users_stripe_subscription_id",
        "account_users",
        ["stripe_subscription_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_account_users_stripe_subscription_id", "account_users", type_="unique")
    op.drop_constraint("uq_account_users_stripe_customer_id", "account_users", type_="unique")
    op.drop_column("account_users", "billing_exempt")
    op.drop_column("account_users", "subscription_current_period_end")
    op.drop_column("account_users", "subscription_plan")
    op.drop_column("account_users", "subscription_status")
    op.drop_column("account_users", "stripe_subscription_id")
    op.drop_column("account_users", "stripe_customer_id")
