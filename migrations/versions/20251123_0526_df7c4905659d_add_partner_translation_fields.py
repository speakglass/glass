"""add partner translation fields"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "df7c4905659d"
down_revision = "68238d42e61d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversation_partners", sa.Column("description_translation", sa.Text(), nullable=True))
    op.add_column("conversation_partners", sa.Column("persona_background_translation", sa.Text(), nullable=True))
    op.add_column("conversation_partners", sa.Column("persona_interests_translation", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("conversation_partners", "persona_interests_translation")
    op.drop_column("conversation_partners", "persona_background_translation")
    op.drop_column("conversation_partners", "description_translation")
