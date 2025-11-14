#!/bin/bash
set -e

echo "🔍 Running Python linting checks..."
echo ""

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Check if running in CI or local
if [ -n "$CI" ]; then
    echo "📦 Installing linting tools..."
    python -m pip install --upgrade pip
    pip install ruff mypy
    echo ""
fi

# Run Ruff
echo "🔍 Running Ruff..."
ruff check src/ tests/
echo "✅ Ruff check passed!"
echo ""

# Run MyPy
echo "🔍 Running MyPy..."
if [ ! -d "venv" ] && [ ! -d ".venv" ] && [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Warning: No virtual environment detected. Installing dependencies..."
    pip install -r requirements.txt
fi
mypy src/ --ignore-missing-imports
echo "✅ MyPy check passed!"
echo ""

echo "🎉 All linting checks passed!"

