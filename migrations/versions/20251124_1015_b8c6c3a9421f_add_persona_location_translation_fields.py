"""Add persona occupation and location translation fields."""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b8c6c3a9421f"
down_revision = "df7c4905659d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_partners",
        sa.Column("persona_occupation_translation", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "conversation_partners",
        sa.Column("persona_city_translation", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "conversation_partners",
        sa.Column("persona_country_translation", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversation_partners", "persona_country_translation")
    op.drop_column("conversation_partners", "persona_city_translation")
    op.drop_column("conversation_partners", "persona_occupation_translation")
