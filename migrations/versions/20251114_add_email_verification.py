"""Add email verification fields

Revision ID: add_email_verification
Revises: 0ae68c5d0ce2
Create Date: 2025-11-14 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_email_verification'
down_revision = '0ae68c5d0ce2'
branch_labels = None
depends_on = None


def upgrade():
    # Add email verification columns to account_users table
    op.add_column('account_users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('account_users', sa.Column('verification_token', sa.String(length=255), nullable=True))
    op.add_column('account_users', sa.Column('verification_token_expires', sa.DateTime(timezone=True), nullable=True))
    
    # Create index on verification_token for faster lookups
    op.create_index(op.f('ix_account_users_verification_token'), 'account_users', ['verification_token'], unique=True)
    
    # Mark existing users as verified (they registered before email verification was implemented)
    op.execute("UPDATE account_users SET email_verified = true WHERE email_verified = false")


def downgrade():
    # Drop index and columns
    op.drop_index(op.f('ix_account_users_verification_token'), table_name='account_users')
    op.drop_column('account_users', 'verification_token_expires')
    op.drop_column('account_users', 'verification_token')
    op.drop_column('account_users', 'email_verified')






