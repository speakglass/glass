#!/bin/bash
# Helper script to create a new migration

if [ -z "$1" ]; then
    echo "Usage: ./scripts/create_migration.sh \"migration message\""
    exit 1
fi

echo "🔄 Creating new migration: $1"
alembic revision --autogenerate -m "$1"

echo "✅ Migration created! Review it in migrations/versions/"
echo "📝 To apply: alembic upgrade head"

