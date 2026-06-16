FROM artifactory.devhub-cloud.cisco.com/sto-cg-docker/python:3.14-dev AS builder
WORKDIR /app

# Pre-create /data owned by the runtime user so the named volume inherits
# the right permissions on first mount (Docker seeds an empty volume from
# the image layer, preserving ownership).
USER root
RUN mkdir -p /data && chown -R nonroot:nonroot /data
USER nonroot

# Install deps first (cached unless lockfile changes)
COPY pyproject.toml uv.lock ./

# Pinned uv version matching local dev
#COPY --from=ghcr.io/astral-sh/uv:0.7.16 /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
UV_PYTHON_DOWNLOADS=0 \
    UV_PYTHON_PREFERENCE=only-system
RUN uv sync --frozen --no-install-project --no-dev

# Then app code
COPY backend/ttt ./ttt/
COPY backend/alembic ./alembic/
COPY backend/alembic.ini ./

FROM artifactory.devhub-cloud.cisco.com/sto-cg-docker/python:3.14
WORKDIR /app

ENV PYTHONPATH="/app/.venv/lib/python3.14/site-packages:/app" \
    TTT_DB_PATH=/data/ttt.db \
    TTT_WIKI_DIR=/data/wiki

# Persist DB + wiki cache across container restarts
VOLUME ["/data"]

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=2 \
  CMD ["python", "-c", "import urllib.request; import os; urllib.request.urlopen('http://localhost:8765/readyz')"]

COPY --from=builder /app /app/
COPY --from=builder --chown=nonroot:nonroot --chmod=777 /data /data

CMD ["/app/.venv/bin/uvicorn", "ttt.main:app", "--host", "0.0.0.0", "--port", "8765"]
