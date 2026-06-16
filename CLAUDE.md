# CLAUDE.md

Instructions for Claude Code (and other coding agents) working on this repo. Read [`PLAN.md`](./PLAN.md) for the full design rationale and what to build next.

## TL;DR

`tiny-teams-with-tokens` is a status-wiki-per-project tool. A **Project** is a strategic effort that owns:

- **Repos** (GitHub repositories — first-class entities, not a JSON list)
- **WebexRooms** (chat sources — connector not yet wired)
- **ConfluenceSpaces** (doc sources — connector not yet wired)
- A wiki tree of markdown pages stored in sqlite

The wiki is two-level: cross-cutting top-level pages (`overview.md`, `product.md`, `architecture.md`, `marketing.md`, `conversations.md`, `standup.md`, `memory.md`) plus per-source subtrees (`repos/<slug>/...`, `webex/<slug>/...`, `confluence/<slug>/...`). Each Project also has `phase` (`prototype | venture | active | sunset`) and `cadence` (`weekly | monthly | quiet`) metadata for lifecycle / signal-from-noise.

Two AI surfaces operate on the wiki:

- **Ingest agent** — runs on demand (Reingest button); uses GitHub MCP + wiki tools to write/update pages.
- **Chat agent** — interactive side panel; same tool surface, ad-hoc questions and edits.

Both agents share `agent/loop.py` inside the **per-project agent container** (`ttt-agent`). Only the system prompt and seed message differ. The backend (`ttt-backend`) keeps sqlite + OAuth + the API; agents run in their own container, reachable over HTTP/SSE on the docker network.

## Page kinds (frontmatter is authoritative)

Each page's YAML frontmatter declares its `kind`:

- **stable** — pinned by the user; agents preserve it across ingests.
- **dynamic** — agents rewrite it on every ingest, grounded by stable pages.
- **report** — special-rendered surface (currently just `standup.md`); rewritten every ingest, hidden from the wiki sidebar.
- **hidden** — agent-only memory (e.g. `memory.md`); read by the agents, hidden from the wiki sidebar by default (toggle to reveal).

**All seed pages currently default to `dynamic` on greenfield.** Users can pin a page as `stable` post-hoc via the kind toggle in the page header. The legacy "stable on greenfield only" semantics is gone — frontmatter is the runtime source of truth, not paths.

## Stack

- **Backend** (`ttt-backend`): Python 3.12, FastAPI, SQLModel + SQLite/PostgreSQL. Owns the API, sqlite, OAuth flows, and orchestrates per-project agent containers. Does NOT import `claude-agent-sdk`. Schema is managed by **Alembic** (`backend/alembic/`); `init_db()` runs `alembic upgrade head` on startup.
- **Agent** (`ttt-agent`): Python 3.12, FastAPI, `claude-agent-sdk`. Per-project container. Only `ttt.agent.*` + `ttt.orchestrator.contract` + `ttt.reports.schema` (pure data) + `ttt.config` get baked into its image; no API routes, no sqlite, no OAuth services.
- **Frontend**: Next.js 15 + React 19 + Tailwind + SWR + Milkdown Crepe (markdown WYSIWYG, markdown is the model) + shadcn/ui (Tooltip, Dialog, Sheet, Popover, Button, Badge, ToggleGroup).
- **Storage**: SQLite for everything project-scoped. Page content lives in the `pagerevision` table (one row per save, latest-by-`created_at` is the current page). A filesystem cache at `data/wiki/<project_id>/` mirrors the current state and is bind-mounted into the agent container at `/project` so the agent's Read/Edit/Write tools operate on real files; sqlite is authoritative.
- **GitHub access**: in-process MCP server (`agent/mcp_github.py`) inside the agent container. Tools surface as `mcp__github__*`.
- **Package management**: `uv` for Python, `npm ci` for frontend. Versions pinned, `save-exact=true` in `frontend/.npmrc`.
- **LLM**: ingest uses Haiku (cost-conscious); chat uses Sonnet (better tool-use reasoning). Configurable via `TTT_INGEST_MODEL` / `TTT_CHAT_MODEL` env on the agent container.

## Container model

```
frontend ──HTTP+SSE──> ttt-backend ──HTTP+SSE──> ttt-agent-{project_id}
                          │  (sqlite, OAuth, API)     │  (Claude SDK + MCPs)
                          │                           ▼
                          │                       /project (mounted wiki dir)
                          │
                          └── /api/internal/projects/{id}/...   ◄── agent callbacks
```

- Backend resolves `ProjectSnapshot` + tokens from sqlite/OAuth services and passes them to the orchestrator (`AgentOrchestrator.ensure_running`).
- Orchestrator (Docker locally; K8s reference stub for the host platform) starts/reuses the per-project agent container, mounts the wiki dir, injects secrets as env, generates a per-agent bearer token.
- Backend opens an SSE stream against the agent's `/chat` or `/ingest`. Agent's persist hook calls back to `/api/internal/projects/{id}/pages` for every Edit/Write — backend's existing `report_repo.write_page` is the receiver, sqlite + FS-cache stay consistent.
- Agent containers are long-lived (one per project). Eviction is the host platform's concern; today nothing culls them.

## Ingest path

A single Claude Agent SDK loop in `agent/ingestor.py` running inside the per-project agent container. The agent reads the wiki on its `/project` mount, calls GitHub MCP tools (scoped to the snapshot's repos), writes pages, and streams `IngestEventPayload`s back to the backend as SSE. The backend (`pipeline/runner.py`) pre-creates the `Report` row, parses the SSE stream into `IngestRun.log` lines, and runs `report_repo.reconcile_from_disk` as a safety net when the run finishes.

To add a new source type (Webex, Confluence, …), add a connector under `agent/connectors/` (snapshot-driven; takes `(token, sources)`) plus its in-process MCP server under `agent/mcp_*.py`. Snapshot fields for new source kinds also need a backend-side projection in `services/agent_runtime.build_snapshot` and the contract schema (`orchestrator/contract.py`).

## Common commands

```bash
# Backend
uv sync --group dev                                       # install
uv run pytest -x -q                                       # tests (forced stub mode, no API calls)
uv run ttt init-data                                      # run alembic migrations + create data/wiki/

# Alembic (database migrations)
make db-migrate                                           # apply pending migrations
make db-revision MSG="add foo column"                     # generate a new migration
make db-history                                           # show migration history
make db-current                                           # show current revision

# Dev server (hot reload)
uv run uvicorn ttt.main:app --port 8765 --reload --reload-dir backend/ttt

# Frontend (hot reload by default)
cd frontend && npm ci                                     # install
cd frontend && npm run dev -- -p 3001                     # dev server
cd frontend && npm run build                              # production build (Docker prod path)

# Docker
docker compose up --build                                 # backend + frontend
# data/ is bind-mounted from the host (./data:/data) so agent containers
# can bind-mount project wiki dirs — do NOT switch back to a named volume.

# Linting, etc. for backend
make backend-ci

# Linting, etc. for frontend
make frontend-ci
```

## Where to start reading the code

In this order:

1. `backend/ttt/models.py` — Project, Repo, WebexRoom, ConfluenceSpace + the wiki-related rows (PageRevision, Report, IngestRun, ChatSession, ChatMessage). Reading this first explains the data shape every other module operates on.
2. `backend/ttt/services/projects.py` — schemas + business logic shared between the HTTP API and MCP server. `create_project_with_greenfield`, `add_repo`, `add_webex_room`, `add_confluence_space`, `start_ingest`, etc.
3. `backend/ttt/orchestrator/` — `AgentOrchestrator` ABC + `contract.py` wire schemas + Docker driver + K8s reference stub. The runtime layer the host platform consumes.
4. `backend/ttt/agent/loop.py` — shared agent factory + persist hook (POSTs to backend instead of writing sqlite). Lives inside the agent container.
5. `backend/ttt/agent/ingestor.py` / `agent/chat.py` — the two agent surfaces. Each builds its system prompt from `ProjectSnapshot` and streams typed event payloads back to the backend.
6. `backend/ttt/agent/mcp_github.py` — in-process GitHub MCP scoped per request to the snapshot's repos.
7. `backend/ttt/services/agent_runtime.py` / `services/agent_proxy.py` — backend-side glue. `agent_runtime` builds `ProjectSnapshot` + `AgentSecrets`; `agent_proxy` opens the SSE stream to the agent and yields parsed events back to the API layer.
8. `backend/ttt/api/internal.py` — `/api/internal/...` callback endpoints the agent hits to persist pages and append ingest logs.
9. `backend/ttt/reports/schema.py` — `DEFAULT_PAGES` (top-level), per-source page-kind helpers. Pure data; lives in both backend and agent images.
10. `backend/ttt/reports/repo.py` — sqlite-backed page store. `write_page` is the single write path; FS cache is mirrored automatically; `reconcile_from_disk` is the FS→sqlite safety net (backend-only).
11. `backend/ttt/api/projects.py` + `backend/ttt/api/mcp_server.py` — thin shells over the service layer. Both surfaces bind to the same Pydantic schemas.
12. `frontend/app/projects/[id]/page.tsx` — the wiki UI: 3-col layout, sidebar / editor / chat. Spawns `IngestLogStream` while locked.

## Conventions worth respecting

### Code

- **Modern Python**: type hints, `X | Y` unions, `async/await` everywhere. `dataclasses` for value objects, `pydantic` for API schemas.
- **No comments unless they explain WHY** something non-obvious is being done. Don't restate what the code does.
- **No emojis** in code or commit messages.
- **Frontend**: client components for anything that mounts editors / uses SWR. App Router, no Pages Router. shadcn primitives wrapped in domain components (e.g. `KindBadge` wraps `Badge` + `Tooltip`).

### Pipeline / agents

- **Frontmatter is authoritative.** When deciding "preserve or rewrite this page," read the file's `kind` frontmatter — never trust the path. `kinds_from_pages()` and `stable_paths_in()` are the runtime helpers; `default_*_paths()` are *seed-only* and should not be used for runtime decisions.
- **Page tree is two-level.** Top-level pages (`DEFAULT_PAGES`) describe the Project as a whole; per-source detail goes under `repos/<slug>/...`, `webex/<slug>/...`, `confluence/<slug>/...`. The ingest agent's system prompt enumerates the exact paths to write — don't invent extra source folders. Use `report_schema.expand_template(prefix, template)` to materialize a per-source subtree.
- **Sources are first-class entities, not JSON arrays.** Repo / WebexRoom / ConfluenceSpace each have their own table, slug, and lifecycle. Don't reintroduce `repos: list[str]` on Project.
- **Both agents share `agent/loop.build_agent_options()`.** Differences between chat and ingest are: system prompt, model, max_turns, persistence target (chat = untagged revisions, ingest = revisions tagged with `report_id`). Add new tools to `agent/loop.py` so both surfaces get them.
- **Backend never imports `claude-agent-sdk`.** The agent loop lives in the agent container. If you find yourself wanting to call SDK constructs from `ttt-backend`, you're on the wrong side of the boundary.
- **Agent connectors are snapshot-driven.** They take `(token, sources)`, never a `Session` or `project_id`. The backend resolves tokens (OAuth services + .env fallback) and sources (sqlite) into `AgentSecrets` + `ProjectSnapshot` and ships them at request time.
- **HTTP API and MCP server share the service layer.** Both delegate to `services/projects.py` (and via it, `services/agent_runtime.py` + `services/agent_proxy.py`). New endpoints/tools should add a service helper first, then thin wrappers in both `api/projects.py` and `api/mcp_server.py`.
- **Bash is denied.** A `PreToolUse` hook in `agent/loop.py` hard-rejects Bash / BashOutput / KillShell. The agent uses Edit/Write for files (so the persist hook records them) and the github MCP for code-level inspection.
- **Don't add propose-diff / human-in-the-loop review machinery.** Auto-accept everywhere. PLAN.md §6.2.
- **No RAG-style status pills, sentiment, or health scores.** PLAN.md §6.8 — explicit design stance.

### Storage

- `data/` is gitignored — sqlite DB and the wiki cache are runtime artifacts.
- The filesystem at `data/wiki/<project_id>/` is a regenerable mirror of sqlite (`report_repo.sync_to_disk(project_id)`). Don't write to it directly outside the persist hook.
- `IngestRun.log` stores the Docker-style live log line-by-line. Frontend polls `/api/ingest/{run_id}` while locked and renders it in `IngestLogStream`.
- Past ingests are auditable via the "Logs" button next to Reingest — `IngestHistoryPanel` lists every `IngestRun` with its full log.

### Migrations

- Schema changes go in `backend/alembic/versions/`. Generate with `make db-revision MSG="describe the change"`.
- `init_db()` in `backend/ttt/db.py` runs `alembic upgrade head` on every startup — migrations are idempotent.
- Databases that were created with the old `create_all` path (no `alembic_version` table) are auto-stamped to head on first startup so existing deployments upgrade without error.
- **Never use `SQLModel.metadata.create_all()` directly** — all schema changes must go through Alembic so they're auditable and reversible.

### Secrets

- `ANTHROPIC_API_KEY` and connector tokens (`GITHUB_TOKEN`, `CONFLUENCE_*`, `WEBEX_TOKEN`) live in `.env`. **Never commit `.env`.** It's gitignored; keep it that way.
- The Webex token in particular must NEVER be logged. The `WebexConnector` has a comment to this effect; respect it.

## What to build next

See [`PLAN.md`](./PLAN.md) §8 and the open GitHub issues. Top of the list right now:

1. **Real Confluence connector** (M6) — blocked on creds.
2. **Real Webex connector** (M7) — blocked on personal token + channel access.
3. **Project interrelations + groups** (#9) → new home page (#3).
4. **Onboarding validation** (#14) — validate gh repos / confluence / webex during create.

**MCP server (M8) — shipped.** Public MCP surface mounted at `/mcp` on the FastAPI app via FastMCP's Streamable HTTP transport (not SSE — `streamable_http_app()` mounted at `/` with `mcp.session_manager.run()` inside the FastAPI lifespan). Tools: `ttt_list_projects`, `ttt_create_project`, `ttt_reingest`, `ttt_cancel_ingest`, `ttt_get_ingest_log`, `ttt_ask`, `ttt_list_repos`, `ttt_add_repo`, `ttt_list_webex_rooms`, `ttt_add_webex_room`, `ttt_list_confluence_spaces`, `ttt_add_confluence_space`. All bound to the same Pydantic schemas as the HTTP API via `services/projects.py`.

If you (the agent) are picking this up cold, follow the "How to pick this up cold" checklist at the bottom of PLAN.md.

## Don't

- Don't reintroduce git-backed page storage. We migrated to a `pagerevision` table — audit is `SELECT … ORDER BY created_at DESC` per page. The `data/wiki/` filesystem is a regenerable cache.
- Don't add a separate "stable runtime list" hardcoded by path. The four page kinds are declared in frontmatter; runtime decisions go through `schema.kinds_from_pages()` / `stable_paths_in()`.
- Don't add propose-diff / human-in-the-loop review machinery. PLAN.md §6.2 — auto-accept everywhere is a deliberate choice.
- Don't introduce a workflow framework (Airflow/Prefect/Celery). PLAN.md §6.7.
- Don't swap Crepe for Tiptap/BlockNote/Lexical-with-markdown-plugin. They lose markdown fidelity. PLAN.md §6.5.
- Don't add RAG status pills / sentiment indicators / health scores. PLAN.md §6.8.
- Don't write into `.env` as a tool call. If you need an API key, ask the user to add it themselves.
- Don't fork the agent surface — chat and ingest stay 99% the same. New tools / capabilities go in `agent/loop.py`, not in one path or the other.
- Don't reintroduce `repos: list[str]` / `confluence_roots: list[str]` / `webex_channels: list[str]` JSON columns on Project. Sources are first-class: Repo, WebexRoom, ConfluenceSpace, each with their own table + slug + lifecycle.
- Don't reintroduce a static fan-out ingest path. The agent loop is the only path. Adding a new source type means adding a connector under `agent/connectors/` plus its in-process MCP server (see `agent/mcp_github.py`).
- Don't reintroduce an in-process agent path in `ttt-backend`. The agent loop runs in the per-project `ttt-agent` container; backend talks to it over HTTP/SSE via the `AgentOrchestrator`. If sqlite is hard to reach from the agent, that's by design — POST to `/api/internal/projects/{id}/...`.
- Don't import sqlite, `ttt.api`, `ttt.services`, `ttt.models`, `ttt.db`, or `ttt.pipeline` from anything under `ttt.agent`. The agent image's `Dockerfile.agent` doesn't include those modules; an import would fail at container start.
