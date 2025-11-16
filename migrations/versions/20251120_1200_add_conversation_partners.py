"""add conversation partners table

Revision ID: 6b21e2a9c883
Revises: 1252ce809acf
Create Date: 2025-11-20 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b21e2a9c883'
down_revision: Union[str, None] = '1252ce809acf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'conversation_partners',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=64), sa.ForeignKey('account_users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('learning_lang', sa.String(length=32), nullable=True),
        sa.Column('native_lang', sa.String(length=32), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('avatar_url', sa.String(length=512), nullable=True),
        sa.Column('voice_id', sa.String(length=255), nullable=True),
        sa.Column('extra_metadata', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_conversation_partners_user_id', 'conversation_partners', ['user_id'])
    op.create_index('ix_conversation_partners_slug', 'conversation_partners', ['slug'])

    op.add_column('account_conversations', sa.Column('partner_id', sa.String(length=64), nullable=True))
    op.add_column('account_conversations', sa.Column('participant_snapshot', sa.JSON(), nullable=True))
    op.create_index('ix_account_conversations_partner_id', 'account_conversations', ['partner_id'])
    op.create_foreign_key(
        'account_conversations_partner_id_fkey',
        source_table='account_conversations',
        referent_table='conversation_partners',
        local_cols=['partner_id'],
        remote_cols=['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('account_conversations_partner_id_fkey', 'account_conversations', type_='foreignkey')
    op.drop_index('ix_account_conversations_partner_id', table_name='account_conversations')
    op.drop_column('account_conversations', 'participant_snapshot')
    op.drop_column('account_conversations', 'partner_id')

    op.drop_index('ix_conversation_partners_slug', table_name='conversation_partners')
    op.drop_index('ix_conversation_partners_user_id', table_name='conversation_partners')
    op.drop_table('conversation_partners')
