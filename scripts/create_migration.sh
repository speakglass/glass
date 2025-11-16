#!/bin/bash
# Helper script to create a new migration using uv

if [ -z "$1" ]; then
    echo "Usage: ./scripts/create_migration.sh \"migration message\""
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT" || exit 1

# Load .env file if it exists (more robust method)
if [ -f .env ]; then
    echo "📄 Loading environment from .env"
    set -a  # Automatically export all variables
    source .env
    set +a  # Stop auto-exporting
fi

# Check if GLASS_DATABASE_URL is set
if [ -z "$GLASS_DATABASE_URL" ]; then
    echo "❌ GLASS_DATABASE_URL environment variable is required"
    echo "💡 Make sure your .env file contains GLASS_DATABASE_URL"
    exit 1
fi

echo "🔄 Creating new migration: $1"

# Use uv run to ensure proper Python environment and module path
uv run alembic revision --autogenerate -m "$1"

if [ $? -eq 0 ]; then
    echo "✅ Migration created! Review it in migrations/versions/"
    echo "📝 To apply: ./scripts/migrate.py or uv run alembic upgrade head"
else
    echo "❌ Migration creation failed"
    exit 1
fi

