"""Add UTM attribution fields to account_users."""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5518a4a1be6b"
down_revision = "c2dff8af7fc7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("account_users", sa.Column("utm_source", sa.String(length=255), nullable=True))
    op.add_column("account_users", sa.Column("utm_campaign", sa.String(length=255), nullable=True))
    op.add_column("account_users", sa.Column("utm_content", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("account_users", "utm_content")
    op.drop_column("account_users", "utm_campaign")
    op.drop_column("account_users", "utm_source")
