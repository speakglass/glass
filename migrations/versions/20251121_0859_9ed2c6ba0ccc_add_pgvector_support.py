"""add_pgvector_support

Revision ID: 9ed2c6ba0ccc
Revises: 7dc6b0967671
Create Date: 2025-11-21 08:59:13.283325

This migration adds pgvector support for semantic memory search:
1. Enables pgvector extension
2. Adds embedding column to memory_records table (1536 dimensions)
3. Instructions for creating HNSW index after backfilling embeddings

After running this migration:
1. Generate embeddings: python scripts/backfill_embeddings.py
2. Create HNSW index: See comments in upgrade() function
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Import pgvector to register VECTOR type with SQLAlchemy
try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    # Fallback for systems without pgvector installed
    Vector = None


# revision identifiers, used by Alembic.
revision: str = "9ed2c6ba0ccc"
down_revision: Union[str, None] = "7dc6b0967671"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add pgvector support for semantic memory search."""

    # Step 1: Enable pgvector extension
    # Note: Requires superuser or rds_superuser role on cloud databases
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Step 2: Clear existing memory records (development migration)
    # This simplifies the migration by avoiding backfill complexity
    # New memories will automatically get embeddings
    op.execute("DELETE FROM memory_records")

    # Step 3: Add embedding column to memory_records
    # Dimension 1536 for OpenAI text-embedding-3-small
    # Note: HNSW index has 2000 dimension limit, so we can't use text-embedding-3-large (3072)
    # Change to 768 for Gemini text-embedding-004
    if Vector is not None:
        op.add_column("memory_records", sa.Column("embedding", Vector(1536), nullable=True))
    else:
        raise RuntimeError("pgvector package is required. Install with: pip install pgvector")

    # Step 4: Create HNSW index for fast vector search
    # Since we cleared existing records, we can create the index immediately
    # Index creation is very fast on empty table
    op.execute(
        """
        CREATE INDEX idx_memory_records_embedding_hnsw
        ON memory_records USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """
    )


def downgrade() -> None:
    """Remove pgvector support."""

    # Drop any indexes first
    op.execute("DROP INDEX IF EXISTS idx_memory_records_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_memory_records_embedding_ivfflat")

    # Remove embedding column
    op.drop_column("memory_records", "embedding")

    # Drop extension (will cascade and remove all vector types)
    op.execute("DROP EXTENSION IF EXISTS vector CASCADE")
