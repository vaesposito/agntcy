# GitHub Access Configuration

TTT needs a GitHub token to read repository data (commits, issues, PRs, file contents) during
ingest and to validate repos during project creation. There are two ways to provide one, and they
serve slightly different purposes.

---

## The two token paths

| Path | Scope | Stored where | Expires |
|---|---|---|---|
| **GitHub App OAuth** | Per-user, per-project | `GitHubOAuthToken` table in sqlite | 8 hours (refresh token valid 6 months) |
| **Personal Access Token (PAT)** | Global fallback for all projects | `.env` → `GITHUB_TOKEN` | Never (until revoked) |

At runtime, the system resolves a GitHub token in this order:

1. Per-project OAuth token from the DB (refreshed automatically if expired and `GITHUB_CLIENT_SECRET` is set).
2. If refresh fails or no per-project token exists: `GITHUB_TOKEN` from `.env`.
3. If neither is available: requests to the GitHub API are unauthenticated. Private repos return `404`.

> **Private and org repos**: GitHub returns `404` — not `401` — for private repos on unauthenticated
> requests, to prevent org enumeration. If you see `404` for a repo you know exists, the token is
> missing or lacks org access, not the repo.

---

## Option A — GitHub App OAuth (recommended)

This is the preferred path. The user authorizes the app once per project and gets a personal
access token scoped to the repos they can see. Tokens refresh automatically.

### 1. Obtain the GitHub App client secret

The app client ID is hardcoded in `backend/ttt/config.py`:

```
github_client_id = "Iv23liNCDywTsOb0TJBA"
```

Get the corresponding client secret from whoever manages the GitHub App registration (the owner
of this app in the GitHub organization settings). You do not need to create a new app.

### 2. Set `GITHUB_CLIENT_SECRET` in `.env`

```
GITHUB_CLIENT_SECRET=<secret from the app owner>
```

This is required for token refresh. Without it, per-project tokens stop working after 8 hours
and the system falls back to the PAT (or no auth).

### 3. Set the redirect URI (non-localhost deploys only)

The default redirect URI is `http://localhost:3000/apps/ttt/oauth/github/callback`. For any
other hostname, override it:

```
GITHUB_REDIRECT_URI=https://your-host/apps/ttt/oauth/github/callback
```

The same URI must also be registered in the GitHub App's "Callback URLs" list in the app settings.

### 4. Ensure the GitHub App is installed on any org you want to access

For a user's personal repos, no extra step is needed — authorizing the app grants access
automatically.

For **organization repos** (e.g. `cisco-eti`): the GitHub App must be installed on that org
by an org owner, and each user must authorize the app. Installation is done from:

```
https://github.com/organizations/<org>/settings/apps
```

Or the app can be installed at install time by an org owner via GitHub's app installation flow.
Without the org installation, OAuth tokens from org members will not include org repos —
repo lookups will return `404`.

### 5. How users connect GitHub in the wizard

When creating a project, users see a **Connect GitHub** button in the Repos step. Clicking it
opens a GitHub OAuth popup. After authorizing, the session token is stored against the project.

The button is hidden when `GITHUB_TOKEN` is set globally (the status shows "Connected"). If the
global PAT lacks org access, click **Connect GitHub** anyway to obtain a per-project OAuth token
with the correct scopes.

---

## Option B — Personal Access Token (PAT)

A PAT is the simpler setup for single-user or local dev environments. It applies globally to all
projects and never expires unless revoked.

### 1. Create a PAT on GitHub

Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**.

Required scope: `repo` (full private repository access, including org repos).

For Cisco org repos (or any org with SAML SSO enabled), after creating the token you must also
**authorize it for the org**:

- Open the token in **Settings → Developer settings → Personal access tokens**.
- Click **Configure SSO** next to the token.
- Authorize for each org you need access to.

Fine-grained tokens are **not recommended** — they require repo-by-repo approval and cannot be
pre-authorized for an entire org.

### 2. Add the token to `.env`

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### 3. Restart the backend

The token is read at startup. After editing `.env`, restart the backend container:

```bash
docker compose restart backend
```

---

## Checking which token path is active

### From the API

```bash
curl http://localhost:8765/api/oauth/github/status
```

Returns `{"connected": true, "github_login": null}` when `GITHUB_TOKEN` is set, or
`{"connected": false, "github_login": null}` when it is not.

> `github_login` is populated only for per-project OAuth tokens, not for the global PAT.

### From the wizard

The repos step shows:

- **"Connected as @login — private repos accessible"** — PAT is set (`GITHUB_TOKEN` is non-empty).
- **"Connect GitHub to access private repos"** — no PAT set; user should click the button for OAuth.

If a PAT is set but org repos still fail validation, you either need to SSO-authorize the PAT
for the org, or click **Connect GitHub** to use the OAuth flow instead.

---

## Summary of required `.env` entries

```bash
# Option A — GitHub App OAuth (full-featured, per-user)
GITHUB_CLIENT_SECRET=<app client secret>
GITHUB_REDIRECT_URI=https://your-host/apps/ttt/oauth/github/callback  # only if not localhost

# Option B — PAT fallback (simpler, global)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

You can set both. The OAuth token takes priority; the PAT is the fallback when no OAuth token
exists for a project or after a failed refresh.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `404` for a repo that exists | No token, or PAT lacks org access | Set `GITHUB_TOKEN` with `repo` scope and SSO-authorize for the org, or use OAuth connect |
| `401 Unauthorized` from GitHub | Expired OAuth token, `GITHUB_CLIENT_SECRET` not set | Set `GITHUB_CLIENT_SECRET` so refresh works |
| "Connect GitHub" button missing even though PAT doesn't have org access | PAT is set so the UI treats GitHub as connected | Click Connect GitHub anyway to get a full-scope OAuth token for the project |
| Repos found in lookahead but `404` on validate | Validate was triggered before OAuth was complete; `GITHUB_TOKEN` PAT used instead | Connect GitHub via the wizard; validate retries automatically after OAuth completes |
| Ingest fails on private org repos after 8 hours | OAuth token expired and `GITHUB_CLIENT_SECRET` not set | Set `GITHUB_CLIENT_SECRET` to enable auto-refresh |
