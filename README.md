# tiny teams with tokens

Status reports for engineering teams that move fast with AI agents — pulled from GitHub, Confluence, and Webex, synthesized by Claude, persisted as an editable wiki.

> **Status:** PoC. Real GitHub connector. Confluence + Webex connectors stubbed pending creds. Built one afternoon, expect rough edges.

## What's interesting about this

Most "AI status report" tools dump activity into a doc and dress it in leadership grammar. The output reads as motion without meaning ("rapid iteration signaling stability work"). That's because there's nothing to *measure* the activity against.

TTT splits each project into two kinds of pages:

| Kind | Lifecycle | Purpose |
|---|---|---|
| **stable** | Written on greenfield ingest. Human-curated thereafter. Preserved across reingests. | The anchor: project purpose, active goals, glossary, architecture. |
| **dynamic** | Rewritten on every reingest. Grounded by the stable pages. | Status, activity, conversations — measured against the stable goals. |

The agent receives the stable pages as context when rewriting dynamic pages. So "bumped litellm" gets filtered out unless an active goal mentions LLM cost; "v1.0.7rc1 released" survives if "ship v1.0" is in the goals. Signal becomes mechanical instead of vibes.

You edit any page in the browser (Milkdown WYSIWYG); page revisions are stored in SQLite.

## Quickstart (Docker, prebuilt images from GHCR)

Requirements: Docker + Docker Compose v2.

### Authenticate to GHCR (cisco-eti org)

Images are hosted on the GitHub Container Registry under the `cisco-eti` org. Pull access requires a GitHub personal access token (PAT).

1. **Create a classic PAT** at [github.com/settings/tokens](https://github.com/settings/tokens) → *Generate new token (classic)*. Grant the `read:packages` scope. No other scopes are needed.
2. **Store the PAT locally** in a file (`YOUR_LOCAL_FILE_WITH_THE_PAT` below) to be used for the `docker login` step. Do this before authorizing the SSO because the key data will disappear from the UI.
2. **Authorize for SSO**: after generating the token, click *Configure SSO* next to it and authorize it for the `cisco-eti` organization.
3. **Log in to GHCR**:
   ```bash
   cat YOUR_LOCAL_FILE_WITH_THE_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```

You only need to do this once per machine; Docker stores the credential in your keychain.

### Pull and run

```bash
git clone https://github.com/cisco-eti/tiny-teams-with-tokens
cd tiny-teams-with-tokens
cp .env.example .env
# add ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) to .env
# (optional) add GITHUB_TOKEN for higher GH rate limits

docker compose --env-file .env -f deploy/local/docker-compose.yml pull && docker compose --env-file .env -f deploy/local/docker-compose.yml up
# backend  → http://localhost:8765
# frontend → http://localhost:3000
```

Images are published on every push to `main` to `ghcr.io/cisco-eti/tiny-teams-with-tokens-{backend,frontend}`. To pin a specific tag, set `TTT_IMAGE_TAG=sha-<short-sha>` in `.env`.

### Authenticate to Artifactory (for local builds)

Building images locally (`make docker-build`) pulls base images from Cisco's Artifactory registry. You need an Artifactory identity token to do this.

1. **Log in** to [artifactory.devhub-cloud.cisco.com](https://artifactory.devhub-cloud.cisco.com) with your Cisco SSO credentials.
2. **Generate an identity token**: click your username in the top-right → *Edit Profile* → *Identity Tokens* → *Generate Token*. Copy the token — it won't be shown again and store it locally in a file `YOUR_LOCAL_FILE_WITH_THE_TOKEN`.
3. **Log in to Artifactory**:
   ```bash
   cat YOUR_LOCAL_FILE_WITH_THE_TOKEN | docker login artifactory.devhub-cloud.cisco.com -u YOUR_CISCO_USERNAME --password-stdin
   ```

You only need to do this once per machine.

To build locally instead of pulling: `make docker-build && make docker-up`.

State (SQLite + wiki cache) persists in `./data/` (a host bind mount). To wipe: `rm -rf data/`.

## Quickstart (local dev)

Requirements: Python 3.12+, [uv](https://github.com/astral-sh/uv), Node 20+, npm.

```bash
# 1. clone + install
git clone https://github.com/cisco-eti/tiny-teams-with-tokens
cd tiny-teams-with-tokens

# 2. environment
cp .env.example .env
# add ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN to .env
# (optional) add GITHUB_TOKEN for higher rate limits

# 3. start everything
bash up.sh
# backend  → http://localhost:8765
# frontend → http://localhost:3001
```

`up.sh` installs deps, initializes the DB if missing, and starts both servers with hot reload.

Click **New project**, give it a name, paste a charter (one paragraph: what the project is and what leadership cares about), point it at a GitHub repo, hit Create. First ingest takes ~15s; the wiki appears.

## Trying it on a real repo

The most fun smoke test:

- Name: anything
- Charter: a sentence or two on what the team is trying to do
- Repos: `mycelium-io/mycelium` (or any public repo)
- Leave Confluence / Webex empty (they fall back to mock fixtures)

When the wiki renders, open `overview.md` first — that's the agent's read on what the project is and its current goals. Then `status.md` will read very differently than a generic AI summary because it's measuring activity against those goals.

If the agent gets jargon wrong (it will — commit messages lie sometimes), edit `glossary.md`, save, reingest. Future syntheses will respect the correction because glossary is in the grounded context for every dynamic page.

## Database configuration

By default TTT uses SQLite stored at `data/ttt.db`. No configuration is needed for local development.

To use PostgreSQL in a hosted deployment, set `TTT_DATABASE_URL` to an `asyncpg` connection URL. The SQLite path setting (`TTT_DB_PATH`) is ignored when `TTT_DATABASE_URL` is set.

| Variable | Default | Description |
|---|---|---|
| `TTT_DATABASE_URL` | *(unset)* | Full async DB URL, e.g. `postgresql+asyncpg://user:pass@host:5432/dbname`. When unset, SQLite is used. |
| `TTT_DB_PATH` | `data/ttt.db` | Path to the SQLite database file. Ignored when `TTT_DATABASE_URL` is set. |

Schema is managed by **Alembic**. Migrations run automatically on startup via `alembic upgrade head`. To generate a new migration after changing a model:

```bash
make db-revision MSG="describe the change"
```

Databases that were created before Alembic was introduced are automatically stamped to the head revision on first startup — no manual steps needed.

## Local dev identity

When running without CAIPE JWT auth (`CAIPE_PROXY=false`, the default), you can configure a stable user identity that gets injected into every request. This ensures creator tracking on new projects and project listing work correctly.

Set in `.env` or docker-compose environment:

| Variable | Default | Description |
|---|---|---|
| `TTT_DEV_USER_EMAIL` | `dev@local` | Email / `sub` for the dev user. Created on first startup with global admin role. |
| `TTT_DEV_USER_NAME` | `Dev User` | Display name for the dev user. |

The dev user is automatically provisioned as a global admin on startup. To also add them to existing projects (created before this feature was enabled):

```bash
uv run ttt install-dev-user
# or inside docker compose:
docker compose exec backend uv run ttt install-dev-user
```

## How it's wired

```
backend/
└── ttt/
    ├── api/
    │   ├── projects.py      CRUD + ingest trigger + cancel
    │   ├── chat.py          SSE chat endpoint
    │   ├── reports.py       page read/write
    │   ├── workspace.py     per-page workspace ops
    │   └── mcp_server.py    MCP tools (ttt_list_projects, ttt_ask)
    ├── pipeline/
    │   ├── agent_core.py    shared agent factory + persist hook
    │   ├── agent_ingestor.py  ingest agent: system prompt, log streaming
    │   └── mcp_github.py    in-process GitHub MCP (wraps httpx connector)
    ├── chat/
    │   └── agent.py         chat agent: system prompt, SSE event translation
    ├── reports/
    │   ├── repo.py          sqlite page store + FS cache mirror
    │   └── schema.py        page kinds, frontmatter, sidebar tree
    ├── models.py            Project, Report, IngestRun, ChatSession
    └── cli.py               `ttt init-data`

frontend/
├── app/
│   ├── page.tsx             project list / home
│   └── projects/[id]/       wiki: sidebar + editor + chat panel
└── components/
    ├── IngestLogStream.tsx  live ingest log (SSE)
    └── ProjectCard.tsx      card with age, delete

data/                        gitignored — sqlite DB + wiki FS cache
```

Pages live in the `pagerevision` table — one row per save. The current state of any page is the latest revision; history is a `SELECT … ORDER BY created_at DESC`. A filesystem cache at `data/wiki/<project_id>/` mirrors current pages so the agent's Read/Edit/Write tools operate on real files; sqlite is authoritative.

## MCP server

The wiki chat agent is exposed as an MCP server so other Claude Code sessions can query it directly.

**Tools:**
- `ttt_list_projects` — list all projects with id, name, and latest version
- `ttt_ask(project_id, question)` — ask the chat agent a question; returns the full response

**Setup:** `.mcp.json` is already committed. As long as the backend is running, Claude Code will connect automatically on session start.

```json
{
  "mcpServers": {
    "ttt": { "type": "http", "url": "http://localhost:8765/mcp" }
  }
}
```

## Run tests

```bash
uv run pytest -x -q
```

Tests force `ANTHROPIC_API_KEY=""` so the agents fall through to deterministic stubs — no API calls, no cost.

## What's stubbed / TODO

- **Confluence connector** — needs base URL + creds. Currently reads `backend/ttt/fixtures/confluence.md`.
- **Webex connector** — needs personal access token + channel access. Currently reads `backend/ttt/fixtures/webex.md`.
- **Citation links** — citations are markdown text right now (`[commit a1b2c3d]`); could resolve to clickable URLs.
- **Greenfield stable regen** — no "regenerate the anchor" button. Edit stable pages by hand or delete and reingest.

## Notes for sharing

- The Anthropic API key in `.env` is yours and is gitignored — it never leaves your machine.
- The lockfiles (`uv.lock`, `frontend/package-lock.json`) are committed; teammates should `uv sync` and `npm ci` to reproduce.
- Cost: a full ingest cycle on a small public repo runs the agent on Haiku. Pennies per ingest.

## License

Unlicensed PoC. Don't ship it to production without further hardening.
