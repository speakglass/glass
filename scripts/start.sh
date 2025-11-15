#!/bin/bash
set -e

echo "🚀 Starting Glass API..."

# Wait for database to be ready
echo "🔍 Waiting for database..."
max_retries=30
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    if python3 -c "
import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def check():
    db_url = os.getenv('GLASS_DATABASE_URL', 'postgresql+asyncpg://glass:glass@localhost:5432/glass')
    engine = create_async_engine(db_url, echo=False)
    try:
        async with engine.connect() as conn:
            await conn.execute(text('SELECT 1'))
        await engine.dispose()
        return True
    except:
        await engine.dispose()
        return False

exit(0 if asyncio.run(check()) else 1)
"; then
        echo "✅ Database is ready"
        break
    fi
    
    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $max_retries ]; then
        echo "⏳ Waiting for database... ($retry_count/$max_retries)"
        sleep 2
    else
        echo "❌ Database not available after $max_retries attempts"
    exit 1
fi
done

# Run migrations
echo "🔄 Running database migrations..."
python3 scripts/migrate.py

if [ $? -ne 0 ]; then
    echo "❌ Migrations failed"
    exit 1
fi

# Start application
echo "🎬 Starting uvicorn server..."
exec uvicorn glass.app:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}"
