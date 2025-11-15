#!/usr/bin/env python3
"""Database migration script using Alembic API."""

import asyncio
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def check_migration_state():
    """Check current database migration state."""
    db_url = os.getenv("GLASS_DATABASE_URL")
    if not db_url:
        print("❌ GLASS_DATABASE_URL environment variable not set")
        return None
    
    engine = create_async_engine(db_url, echo=False)
    
    try:
        async with engine.connect() as conn:
            # Check if alembic_version table exists
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public'
                    AND table_name = 'alembic_version'
                )
            """))
            has_alembic = result.scalar()
            
            # Check if any tables exist
            result = await conn.execute(text("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
            """))
            table_count = result.scalar()
            
            await engine.dispose()
            
            if has_alembic:
                return "upgrade"
            elif table_count > 0:
                return "stamp"
            else:
                return "upgrade"
                
    except Exception as e:
        print(f"❌ Error checking database state: {e}")
        await engine.dispose()
        return None


def run_migrations():
    """Run database migrations using Alembic API."""
    # Get alembic.ini path
    script_dir = Path(__file__).parent.parent
    alembic_ini = script_dir / "alembic.ini"
    
    if not alembic_ini.exists():
        print(f"❌ alembic.ini not found at {alembic_ini}")
        return False
    
    # Configure Alembic
    alembic_cfg = Config(str(alembic_ini))
    alembic_cfg.set_main_option("script_location", str(script_dir / "migrations"))
    
    # Check migration state
    print("🔍 Checking database state...")
    state = asyncio.run(check_migration_state())
    
    if state is None:
        return False
    
    try:
        if state == "stamp":
            print("📌 Database has tables but no migration history. Stamping current version...")
            command.stamp(alembic_cfg, "head")
            print("✅ Database stamped successfully")
        
        print("🔄 Running migrations...")
        command.upgrade(alembic_cfg, "head")
        print("✅ Migrations completed successfully")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)

