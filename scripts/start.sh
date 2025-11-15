#!/bin/bash
set -e

echo "🚀 Starting Glass API..."

# Check if database is available (with retry logic)
echo "🔍 Checking database connectivity..."
python3 << END
import asyncio
import sys
import os
from sqlalchemy.ext.asyncio import create_async_engine

async def check_db():
    db_url = os.getenv("GLASS_DATABASE_URL", "postgresql+asyncpg://glass:glass@localhost:5432/glass")
    engine = create_async_engine(db_url, echo=False)
    max_retries = 30
    retry_delay = 2
    
    for i in range(max_retries):
        try:
            async with engine.connect() as conn:
                from sqlalchemy import text
                await conn.execute(text("SELECT 1"))
            print(f"✅ Database is ready!")
            await engine.dispose()
            return True
        except Exception as e:
            if i < max_retries - 1:
                print(f"⏳ Waiting for database... ({i+1}/{max_retries})")
                await asyncio.sleep(retry_delay)
            else:
                print(f"❌ Database connection failed after {max_retries} attempts: {e}")
                await engine.dispose()
                return False
    return False

if not asyncio.run(check_db()):
    sys.exit(1)
END

if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to database"
    exit 1
fi

# Run database migrations
echo "🔄 Running database migrations..."

# Check if alembic_version table exists and if migrations are needed
python3 << 'PYEOF'
import sys
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check_and_stamp():
    db_url = os.getenv("GLASS_DATABASE_URL", "postgresql+asyncpg://glass:glass@localhost:5432/glass")
    engine = create_async_engine(db_url, echo=False)
    
    try:
        async with engine.connect() as conn:
            # Check if alembic_version table exists
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'alembic_version'
                )
            """))
            table_exists = result.scalar()
            
            if not table_exists:
                # Check if account_users exists (means DB was created without alembic)
                result = await conn.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'account_users'
                    )
                """))
                has_tables = result.scalar()
                
                if has_tables:
                    print("⚠️  Database has tables but no alembic_version. Will stamp current version.")
                    await engine.dispose()
                    return "stamp"
            
            await engine.dispose()
            return "upgrade"
    except Exception as e:
        print(f"Error checking database: {e}")
        await engine.dispose()
        return "upgrade"

result = asyncio.run(check_and_stamp())
sys.exit(0 if result == "upgrade" else 1)
PYEOF

if [ $? -eq 0 ]; then
    # Normal upgrade
    alembic upgrade head
else
    # Stamp first, then upgrade
    echo "📌 Stamping database to current migration version..."
    alembic stamp head
alembic upgrade head
fi

if [ $? -ne 0 ]; then
    echo "❌ Migration failed"
    exit 1
fi

echo "✅ Migrations completed successfully"

# Start the application
echo "🎬 Starting uvicorn server..."
exec uvicorn glass.app:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"

