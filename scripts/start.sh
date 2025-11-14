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
alembic upgrade head

if [ $? -ne 0 ]; then
    echo "❌ Migration failed"
    exit 1
fi

echo "✅ Migrations completed successfully"

# Start the application
echo "🎬 Starting uvicorn server..."
exec uvicorn glass.app:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"

