"""Add table for persisting partner generation jobs."""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2dff8af7fc7"
down_revision = "b8c6c3a9421f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "partner_generation_jobs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("account_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("steps_completed", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("persona_preview", sa.JSON(), nullable=True),
        sa.Column(
            "partner_id",
            sa.String(length=64),
            sa.ForeignKey("conversation_partners.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("voice_id", sa.String(length=255), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_partner_generation_jobs_user_id",
        "partner_generation_jobs",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_partner_generation_jobs_user_id", table_name="partner_generation_jobs")
    op.drop_table("partner_generation_jobs")
