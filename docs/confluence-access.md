# Confluence Access Configuration

TTT reads Confluence page content and inline comments during ingest. There are two ways to
provide credentials, depending on whether you are using Atlassian Cloud or a self-hosted instance.

---

## The two credential paths

| Path | Scope | Stored where | Expires |
|---|---|---|---|
| **Atlassian OAuth 2.0 (3LO)** | Per-user, per-project | `ConfluenceOAuthToken` table in sqlite | Short-lived access token + long-lived refresh token |
| **Basic auth token** | Global fallback for all projects | `.env` → `CONFLUENCE_TOKEN` + `CONFLUENCE_BASE_URL` | Never (until revoked) |

At runtime, the system resolves a Confluence token in this order:

1. Per-project OAuth token from the DB (auto-refreshed when expired, provided `CONFLUENCE_CLIENT_SECRET` is set).
2. If no per-project token exists or refresh fails: `CONFLUENCE_TOKEN` and `CONFLUENCE_BASE_URL` from `.env`.
3. If neither is available: Confluence ingest is skipped.

> **`cloud_id`**: All Atlassian Cloud REST API v2 calls require a `cloud_id` — a UUID that
> identifies your Atlassian site (e.g. `yourcompany.atlassian.net`). TTT fetches it automatically
> from the Atlassian accessible-resources endpoint after OAuth completes and stores it with the
> token. You do not need to find or set it manually when using OAuth.

---

## Option A — Atlassian OAuth 2.0 (recommended for Cloud)

This is the preferred path for Atlassian Cloud. The user authorizes the app once per project and
gets a token scoped to the Confluence spaces they can see. Tokens refresh automatically.

### 1. Obtain the Atlassian OAuth app client secret

The app client ID is hardcoded in `backend/ttt/config.py`:

```
confluence_client_id = "KW10oZsb59RJBnTsj2D14sxMThYKoM0O"
```

Get the corresponding client secret from whoever manages the Atlassian OAuth app registration.
The app is registered in the [Atlassian developer console](https://developer.atlassian.com/console/myapps/).

### 2. Set `CONFLUENCE_CLIENT_SECRET` in `.env`

```
CONFLUENCE_CLIENT_SECRET=<secret from the app owner>
```

This is required for token refresh. Without it, per-project tokens stop working when the
access token expires and the system falls back to the basic auth token (or no auth).

### 3. Set the redirect URI (non-localhost deploys only)

The default redirect URI is `http://localhost:3000/apps/ttt/oauth/confluence/callback`. For any
other hostname, override it:

```
CONFLUENCE_REDIRECT_URI=https://your-host/apps/ttt/oauth/confluence/callback
```

The same URI must also be listed in the Atlassian app's **Callback URLs** in the developer console.

### 4. Verify the app's scopes

The OAuth app must have the following scopes granted in the Atlassian developer console:

| Scope | Purpose |
|---|---|
| `offline_access` | Enables refresh tokens — required for long-term access |
| `read:confluence-space.summary` | List spaces |
| `read:confluence-props` | Read page properties |
| `read:confluence-content.all` | Read full page body and inline comments |
| `read:confluence-content.summary` | Read page summaries |
| `search:confluence` | Search across spaces |

If `offline_access` is missing, tokens are not refreshable and stop working after expiry.

### 5. How users connect Confluence in the wizard

When creating a project, users see a **Connect Confluence** button in the Confluence step.
Clicking it opens an Atlassian OAuth popup. After authorizing, the wizard displays the
user's accessible Confluence spaces and lets them select which pages to include. The session
token is stored against the project at creation time.

The OAuth flow uses the standard [Atlassian 3LO (three-legged OAuth)](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/)
with `client_secret` (not PKCE).

---

## Option B — Basic auth / API token (self-hosted or simpler setup)

Use this path for Confluence Server / Data Center, or for Atlassian Cloud if you prefer a
static token over per-user OAuth.

### 1. Create an API token

For **Atlassian Cloud**, go to:
[https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

Click **Create API token**. Copy the token value — it is only shown once.

For **Confluence Server / Data Center**, create a Personal Access Token (PAT) in your user
profile under **Profile → Personal Access Tokens**, or use a password if PATs are not enabled.

### 2. Add credentials to `.env`

```
# Your Atlassian Cloud site URL, e.g. https://yourcompany.atlassian.net
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net

# Email address of the account that owns the token
CONFLUENCE_USER=you@yourcompany.com

# API token (Cloud) or PAT / password (Server/DC)
CONFLUENCE_TOKEN=<your token>
```

All three variables are required for basic auth. `CONFLUENCE_BASE_URL` alone is not enough.

### 3. Set `cloud_id` for Atlassian Cloud basic auth

When using basic auth with Atlassian Cloud (not OAuth), the system still needs the `cloud_id`
to construct API v2 calls. You can find it by calling:

```bash
curl -u you@yourcompany.com:<token> \
  https://api.atlassian.com/oauth/token/accessible-resources
```

The response contains a list of sites; copy the `id` field for your site. Then set it in `.env`:

> **Note**: basic auth does not trigger the accessible-resources flow automatically. If you
> are using Atlassian Cloud and the ingest agent is not finding the right site, switching to
> Option A (OAuth) is easier — `cloud_id` is fetched and stored automatically.

### 4. Restart the backend

```bash
docker compose restart backend
```

---

## Checking which credential path is active

### From the API (project-level)

```bash
curl http://localhost:8765/api/projects/<project_id>/oauth/confluence/status
```

Returns:

```json
{
  "connected": true,
  "expires_at": "2026-06-05T18:00:00",
  "scope": "offline_access read:confluence-space.summary ...",
  "site_url": "https://yourcompany.atlassian.net"
}
```

`connected: false` means no per-project OAuth token; the system will use the env-based basic auth
token if configured.

### From the wizard

The Confluence step shows:

- A **Connect Confluence** button — click it to start OAuth.
- After connecting, the available spaces for the authorized account are listed for selection.

---

## Summary of required `.env` entries

```bash
# Option A — Atlassian OAuth 2.0 (recommended for Cloud)
CONFLUENCE_CLIENT_SECRET=<app client secret>
CONFLUENCE_REDIRECT_URI=https://your-host/apps/ttt/oauth/confluence/callback  # only if not localhost

# Option B — Basic auth / API token
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net
CONFLUENCE_USER=you@yourcompany.com
CONFLUENCE_TOKEN=<api token or PAT>
```

You can set both. The per-project OAuth token takes priority; basic auth is the fallback when
no OAuth token exists for a project or after a failed refresh.

---

## What TTT reads from Confluence

The ingest agent uses the Confluence MCP tools to read:

| Tool | What it fetches |
|---|---|
| `confluence_list_spaces` | Available spaces the token can see |
| `confluence_get_pages` | Pages within a space, by space key |
| `confluence_get_page_content` | Full page body (converted from Confluence storage format to Markdown) plus inline comments as a "Discussion" section |

Pages selected during project creation (or added later via project settings) are ingested into
the wiki under the project's Confluence source subtree. Each space gets its own `overview.md`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Confluence step shows no spaces after connecting | Token lacks `read:confluence-space.summary` scope, or app is not authorized on any Cloud site | Check scopes in the Atlassian developer console; re-authorize |
| "Connect Confluence" button does nothing / popup fails | `CONFLUENCE_CLIENT_SECRET` not set, or redirect URI mismatch | Set `CONFLUENCE_CLIENT_SECRET` and verify the callback URL in both `.env` and the Atlassian app settings |
| Ingest fails after first run | OAuth access token expired and `CONFLUENCE_CLIENT_SECRET` not set for refresh | Set `CONFLUENCE_CLIENT_SECRET` so refresh works |
| Basic auth works in browser but ingest fails | `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER`, or `CONFLUENCE_TOKEN` missing or wrong in `.env` | Verify all three are set; test with `curl -u user:token BASE_URL/wiki/rest/api/space` |
| Spaces listed but page content returns errors | Token has `read:confluence-space.summary` but not `read:confluence-content.all` | Add the missing scopes in the Atlassian developer console and re-authorize |
| Cloud site not found (wrong `cloud_id`) | Using basic auth on Cloud without OAuth; `cloud_id` not available | Switch to OAuth (fetches `cloud_id` automatically) or find it manually via the accessible-resources endpoint |
