# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

# Build stage to install deps
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
# ponytail: requirements.txt was already the pinned source of truth; the old
# hardcoded install here was missing sqlalchemy/alembic/asyncpg/etc and could
# never have booted or migrated. Install from the file instead of a second
# hand-maintained list.
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Final runtime
FROM base AS runtime
ENV APP_ENV=prod \
    APP_VERSION=0.1.0
COPY --from=deps /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=deps /usr/local/bin /usr/local/bin
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
EXPOSE 8000
# Shell form on purpose: migrations must run before the server, and Railway's
# public edge connects over IPv4 — bind 0.0.0.0, not :: (three healthy [::]
# boots answered every public request with 502 on 2026-08-30).
CMD alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port 8000

