FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy application code first (needed for -e . in requirements.txt)
COPY pyproject.toml requirements.txt ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
COPY scripts ./scripts

# Install dependencies (after src is copied)
RUN pip install --no-cache-dir -r requirements.txt

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Create necessary directories
RUN mkdir -p /app/var/uploads

EXPOSE 8000

# Use the production start script (includes migrations)
CMD ["/app/scripts/start.sh"]
