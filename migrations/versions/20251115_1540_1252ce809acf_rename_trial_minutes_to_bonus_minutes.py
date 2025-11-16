"""rename_trial_minutes_to_bonus_minutes

Revision ID: 1252ce809acf
Revises: add_email_verification
Create Date: 2025-11-15 15:40:48.920236

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1252ce809acf'
down_revision: Union[str, None] = 'add_email_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename trial_minutes to bonus_minutes (preserves existing data)
    op.alter_column('account_users', 'trial_minutes', new_column_name='bonus_minutes')
    
    # Remove server_default from email_verified (should be set by application logic)
    op.alter_column('account_users', 'email_verified',
               existing_type=sa.BOOLEAN(),
               server_default=None,
               existing_nullable=False)


def downgrade() -> None:
    # Rename bonus_minutes back to trial_minutes
    op.alter_column('account_users', 'bonus_minutes', new_column_name='trial_minutes')
    
    # Restore server_default for email_verified
    op.alter_column('account_users', 'email_verified',
               existing_type=sa.BOOLEAN(),
               server_default=sa.text('false'),
               existing_nullable=False)

