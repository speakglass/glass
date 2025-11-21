#!/usr/bin/env python3
"""Backfill embeddings for existing memory records.

This script generates embeddings for memory records that don't have them yet.
It processes records in batches to respect API rate limits and provides
progress tracking.

Usage:
    python scripts/backfill_embeddings.py [--batch-size BATCH_SIZE] [--max-records MAX_RECORDS] [--provider PROVIDER]

Examples:
    # Backfill all records with default settings
    python scripts/backfill_embeddings.py

    # Backfill first 100 records only
    python scripts/backfill_embeddings.py --max-records 100

    # Use larger batch size for faster processing
    python scripts/backfill_embeddings.py --batch-size 200

    # Use Gemini instead of OpenAI
    python scripts/backfill_embeddings.py --provider gemini
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy import func, select, update

from glass.adapters.memory.embedder import MemoryEmbedder
from glass.persistence.db import MemoryRecord, PersistenceDatabase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
LOGGER = logging.getLogger(__name__)


async def backfill_embeddings(
    database_url: str,
    *,
    batch_size: int = 100,
    max_records: int | None = None,
    provider: str = "openai",
    api_key: str | None = None,
) -> None:
    """Backfill embeddings for existing memory records.

    Args:
        database_url: PostgreSQL connection URL
        batch_size: Number of records to process per batch
        max_records: Optional limit on total records to process (for testing)
        provider: Embedding provider ("openai" or "gemini")
        api_key: Optional API key (uses environment variable if not provided)
    """
    LOGGER.info("=" * 60)
    LOGGER.info("Starting embedding backfill process")
    LOGGER.info("=" * 60)
    LOGGER.info(f"Provider: {provider}")
    LOGGER.info(f"Batch size: {batch_size}")
    if max_records:
        LOGGER.info(f"Max records: {max_records}")

    # Initialize embedder
    try:
        embedder = MemoryEmbedder(provider=provider, api_key=api_key)
        LOGGER.info(f"✓ Embedder initialized (model: {embedder.model}, dimension: {embedder.dimension})")
    except Exception as e:
        LOGGER.error(f"✗ Failed to initialize embedder: {e}")
        return

    # Initialize database
    try:
        db = PersistenceDatabase(database_url)
        await db.init_models()
        LOGGER.info("✓ Database connection established")
    except Exception as e:
        LOGGER.error(f"✗ Failed to connect to database: {e}")
        return

    # Count records to process
    async_session = db.session()
    async with async_session() as session:
        total_stmt = select(func.count()).select_from(MemoryRecord).where(MemoryRecord.embedding.is_(None))
        total = await session.scalar(total_stmt) or 0

        LOGGER.info(f"Found {total:,} records without embeddings")

        if total == 0:
            LOGGER.info("✓ All records already have embeddings!")
            return

        if max_records:
            total = min(total, max_records)
            LOGGER.info(f"Processing limit: {total:,} records")

    # Process records in batches
    processed = 0
    failed = 0

    try:
        while processed < total:
            async with async_session() as session:
                # Fetch batch of records without embeddings
                stmt = select(MemoryRecord).where(MemoryRecord.embedding.is_(None)).limit(batch_size)
                records = (await session.scalars(stmt)).all()

                if not records:
                    break

                LOGGER.info(f"\n--- Processing batch {processed//batch_size + 1} ({len(records)} records) ---")

                # Generate embeddings for batch
                batch_updates = []
                for i, record in enumerate(records):
                    try:
                        # Generate embedding
                        embedding = await embedder.embed_memory(text=record.text)

                        batch_updates.append(
                            {
                                "id": record.id,
                                "embedding": embedding,
                            }
                        )

                        # Progress indicator
                        if (i + 1) % 10 == 0 or i == len(records) - 1:
                            print(f"  Generated embeddings: {i + 1}/{len(records)}", end="\r")

                    except Exception as e:
                        LOGGER.error(f"  ✗ Failed to embed record {record.id}: {e}")
                        failed += 1

                print()  # New line after progress indicator

                # Bulk update embeddings
                if batch_updates:
                    for update_data in batch_updates:
                        stmt = (
                            update(MemoryRecord)
                            .where(MemoryRecord.id == update_data["id"])
                            .values(embedding=update_data["embedding"])
                        )
                        await session.execute(stmt)

                    await session.commit()
                    processed += len(batch_updates)

                    LOGGER.info(f"  ✓ Updated {len(batch_updates)} records in database")
                    LOGGER.info(f"Progress: {processed:,}/{total:,} ({100*processed//total}%)")

            # Rate limiting (adjust based on provider limits)
            # OpenAI: 3,000 RPM for tier 1, 10,000 for tier 2
            # Gemini: 1,500 RPM for free tier
            if provider == "openai":
                await asyncio.sleep(0.5)  # ~120 requests/minute with batch_size=100
            elif provider == "gemini":
                await asyncio.sleep(1.0)  # ~60 requests/minute
            else:
                await asyncio.sleep(1.0)

    except KeyboardInterrupt:
        LOGGER.warning("\n⚠ Interrupted by user")
    except Exception as e:
        LOGGER.error(f"\n✗ Unexpected error: {e}", exc_info=True)

    # Summary
    LOGGER.info("\n" + "=" * 60)
    LOGGER.info("Backfill complete!")
    LOGGER.info("=" * 60)
    LOGGER.info(f"Records processed: {processed:,}")
    if failed > 0:
        LOGGER.warning(f"Records failed: {failed:,}")
    LOGGER.info(f"Success rate: {100*processed//(processed+failed) if (processed+failed) > 0 else 0}%")

    # Next steps
    if processed > 0:
        LOGGER.info("\n📝 Next steps:")
        LOGGER.info("1. Create HNSW index for fast vector search:")
        LOGGER.info("   CREATE INDEX idx_memory_records_embedding_hnsw")
        LOGGER.info("   ON memory_records USING hnsw (embedding vector_cosine_ops)")
        LOGGER.info("   WITH (m = 16, ef_construction = 64);")


async def main() -> None:
    """Main entry point for backfill script."""
    parser = argparse.ArgumentParser(
        description="Backfill embeddings for existing memory records",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of records to process per batch (default: 100)",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=None,
        help="Maximum number of records to process (default: all)",
    )
    parser.add_argument(
        "--provider",
        type=str,
        default=os.getenv("GLASS_EMBEDDING_PROVIDER", "openai"),
        choices=["openai", "gemini"],
        help="Embedding provider to use (default: from GLASS_EMBEDDING_PROVIDER or 'openai')",
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default=None,
        help="Database URL (default: from GLASS_DATABASE_URL env var)",
    )

    args = parser.parse_args()

    # Get database URL
    database_url = args.database_url or os.getenv("GLASS_DATABASE_URL")
    if not database_url:
        LOGGER.error("❌ Database URL not provided")
        LOGGER.error("Set GLASS_DATABASE_URL environment variable or use --database-url")
        sys.exit(1)

    # Get API key from environment
    # Try both direct key (OPENAI_API_KEY) and Glass config key (GLASS_OPENAI_API_KEY)
    api_key = None
    if args.provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("GLASS_OPENAI_API_KEY")
        if not api_key:
            LOGGER.warning("⚠ OPENAI_API_KEY or GLASS_OPENAI_API_KEY not set, will try to use default credentials")
    elif args.provider == "gemini":
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GLASS_GEMINI_API_KEY")
        if not api_key:
            LOGGER.warning("⚠ GOOGLE_API_KEY or GLASS_GEMINI_API_KEY not set, will try to use default credentials")

    # Run backfill
    await backfill_embeddings(
        database_url=database_url,
        batch_size=args.batch_size,
        max_records=args.max_records,
        provider=args.provider,
        api_key=api_key,
    )


if __name__ == "__main__":
    asyncio.run(main())
