# local-docker — llm-wiki with Docker Compose

Runs the backend, frontend, and PostgreSQL locally using Docker Compose. Per-project agent containers are managed by the `DockerOrchestrator` at runtime — the backend spawns them on demand by talking to the Docker daemon.

## Prerequisites

- Docker (with Compose v2)
- `.env` at the repo root — copy `.env.example` and fill in secrets

Minimum `.env` contents:

```
ANTHROPIC_API_KEY=sk-ant-...   # or ANTHROPIC_AUTH_TOKEN
GITHUB_CLIENT_SECRET=...
```

## Quick start

All `make` targets are run from the **repo root** or directly:

```bash
# Build images and start everything
make -f deploy/local-docker/Makefile docker-up

# App is available at:
open http://localhost:3000/apps/ttt
```

Stop:

```bash
make -f deploy/local-docker/Makefile docker-down
```

## Targets

| Target | What it does |
|--------|-------------|
| `docker-build` | Builds all three images (`backend`, `frontend`, `ttt-agent`) from local source |
| `docker-up` | Builds then starts `backend` + `frontend` + `postgres`; prints the app URL |
| `docker-down` | Stops and removes containers (data volumes are preserved) |
| `docker-clean` | Stops containers, removes volumes, and force-removes any running `ttt-agent-*` containers |

`docker-up` always rebuilds first so changes to backend or frontend source are picked up automatically.

## Services

| Service | Port | Notes |
|---------|------|-------|
| frontend | `3000` | Next.js; proxies API calls to backend |
| backend | `8765` | FastAPI; mounts `./data` for SQLite + wiki cache |
| postgres | — | Internal only; not exposed to the host |

## How agent containers work

The backend uses `TTT_ORCHESTRATOR=docker` to spin up a `ttt-agent:local` container per project on demand (when a user triggers an ingest or opens a chat). It does this by talking to the Docker daemon via the socket mounted at `/var/run/docker.sock`.

The `ttt-agent` service in `docker-compose.yml` is tagged `profiles: [build-only]` — it is never started by `docker compose up` but its image is built by `docker-build` so the orchestrator can run it.

Agent containers join the `ttt-net` network and are named `ttt-agent-{project_id}-{role}`. `make docker-clean` removes any leftover agent containers.

## Data persistence

`./data/` at the repo root is bind-mounted into the backend at `/data`:

- `data/ttt.db` — SQLite database (authoritative source for all project data)
- `data/wiki/` — per-project markdown page cache (regenerable from SQLite)
- `data/agent-sessions/` — per-project Claude SDK transcript store

`./data/` is gitignored. `make docker-clean` removes the named `ttt-pg-data` Docker volume (PostgreSQL data) but leaves `./data/` intact.

## PostgreSQL

`docker-compose.postgres.yml` adds a `postgres:16` service and reconfigures the backend to use `postgresql+asyncpg://ttt:ttt@postgres:5432/ttt`. Both Compose files are always loaded together by the Makefile — PostgreSQL is always active in this setup.

The `uuid-ossp` extension is enabled automatically via `postgres-init/init.sql` on first startup.

## Using a specific image tag

By default images are pulled from GHCR with tag `latest`. Pin to a specific release:

```bash
TTT_IMAGE_TAG=v1.2.3 make -f deploy/local-docker/Makefile docker-up
```

## Files

| File | Purpose |
|------|---------|
| `Makefile` | Convenience targets wrapping `docker compose` |
| `docker-compose.yml` | Backend, frontend, and build-only agent service definitions |
| `docker-compose.postgres.yml` | PostgreSQL service and backend database URL override |
| `postgres-init/init.sql` | Runs on first PostgreSQL startup to enable `uuid-ossp` |
