"""Add relational memory tables

Revision ID: add_memory_tables
Revises: add_email_verification
Create Date: 2025-02-11 10:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_memory_tables"
down_revision = "add_email_verification"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "memory_threads",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("partner_id", sa.String(length=128), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("last_context", sa.Text(), nullable=True),
        sa.Column("last_interaction_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), server_onupdate=sa.func.now()),
    )
    op.create_index("ix_memory_threads_user_id", "memory_threads", ["user_id"])
    op.create_index("ix_memory_threads_partner_id", "memory_threads", ["partner_id"])

    op.create_table(
        "memory_messages",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("thread_id", sa.String(length=128), sa.ForeignKey("memory_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_memory_messages_thread_id", "memory_messages", ["thread_id"])
    op.create_index("ix_memory_messages_thread_time", "memory_messages", ["thread_id", "occurred_at"])
    op.create_index("ix_memory_messages_user_id", "memory_messages", ["user_id"])

    op.create_table(
        "memory_records",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=128), nullable=True),
        sa.Column("partner_id", sa.String(length=128), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("retention", sa.String(length=32), nullable=False),
        sa.Column("importance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("keywords", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("entities", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("metadata", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("source_reference", sa.String(length=128), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), server_onupdate=sa.func.now()),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
    )
    op.create_index("ix_memory_records_user_id", "memory_records", ["user_id"])
    op.create_index("ix_memory_records_thread_id", "memory_records", ["thread_id"])
    op.create_index("ix_memory_records_partner_id", "memory_records", ["partner_id"])
    op.create_index("ix_memory_records_category", "memory_records", ["category"])
    op.create_index("ix_memory_records_retention", "memory_records", ["retention"])
    op.create_index("ix_memory_records_user_hash", "memory_records", ["user_id", "content_hash"], unique=True)

    op.create_table(
        "memory_personas",
        sa.Column("user_id", sa.String(length=64), primary_key=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=128), nullable=True),
        sa.Column("last_name", sa.String(length=128), nullable=True),
        sa.Column("native_languages", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("learning_languages", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("traits", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("metadata", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), server_onupdate=sa.func.now()),
    )

    op.create_table(
        "memory_partner_profiles",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("partner_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("relation_to_user", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), server_onupdate=sa.func.now()),
    )
    op.create_index("ix_memory_partner_profiles_user_partner", "memory_partner_profiles", ["user_id", "partner_id"], unique=True)

    op.create_table(
        "memory_feedback_records",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column("payload", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_memory_feedback_records_user_id", "memory_feedback_records", ["user_id"])
    op.create_index("ix_memory_feedback_records_language", "memory_feedback_records", ["language_code"])


def downgrade():
    op.drop_index("ix_memory_feedback_records_language", table_name="memory_feedback_records")
    op.drop_index("ix_memory_feedback_records_user_id", table_name="memory_feedback_records")
    op.drop_table("memory_feedback_records")

    op.drop_index("ix_memory_partner_profiles_user_partner", table_name="memory_partner_profiles")
    op.drop_table("memory_partner_profiles")

    op.drop_table("memory_personas")

    op.drop_index("ix_memory_records_user_hash", table_name="memory_records")
    op.drop_index("ix_memory_records_retention", table_name="memory_records")
    op.drop_index("ix_memory_records_category", table_name="memory_records")
    op.drop_index("ix_memory_records_partner_id", table_name="memory_records")
    op.drop_index("ix_memory_records_thread_id", table_name="memory_records")
    op.drop_index("ix_memory_records_user_id", table_name="memory_records")
    op.drop_table("memory_records")

    op.drop_index("ix_memory_messages_user_id", table_name="memory_messages")
    op.drop_index("ix_memory_messages_thread_time", table_name="memory_messages")
    op.drop_index("ix_memory_messages_thread_id", table_name="memory_messages")
    op.drop_table("memory_messages")

    op.drop_index("ix_memory_threads_partner_id", table_name="memory_threads")
    op.drop_index("ix_memory_threads_user_id", table_name="memory_threads")
    op.drop_table("memory_threads")
