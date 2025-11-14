FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./
COPY src ./src
RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /app/var/uploads

EXPOSE 8000

CMD ["uvicorn", "glass.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
