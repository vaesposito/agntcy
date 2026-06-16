# Webex Meetings Access Configuration

TTT reads meeting transcripts and AI-generated summaries from Webex during ingest. There are two
ways to provide credentials: per-user OAuth (preferred) or a static personal/bot token.

---

## The two credential paths

| Path | Scope | Stored where | Expires |
|---|---|---|---|
| **Webex OAuth 2.0 (PKCE)** | Per-user, per-project | `WebexOAuthToken` table in sqlite | Short-lived access token + longer-lived refresh token |
| **Personal / bot token** | Global fallback for all projects | `.env` → `WEBEX_TOKEN` | Never (until revoked) |

At runtime, the system resolves a Webex token in this order:

1. Per-project OAuth token from the DB (auto-refreshed when expired, provided `WEBEX_CLIENT_SECRET` is set).
2. If no per-project token exists or refresh fails: `WEBEX_TOKEN` from `.env`.
3. If neither is available: Webex ingest is skipped.

> **Security note**: the `WEBEX_TOKEN` value (and all Webex access tokens) must never be written
> to logs. Meeting transcripts can contain sensitive business conversation. The code enforces
> this — tokens are passed only as `Authorization: Bearer` headers in memory and are never
> serialized to any log output.

---

## Option A — Webex OAuth 2.0 (recommended)

This is the preferred path. The user authorizes the app once per project and gets a token
scoped to their own Webex account. Tokens refresh automatically.

The OAuth flow uses **Authorization Code with PKCE (S256)** and `client_secret`. Both are
sent during code exchange, making the flow secure for server-side use.

### 1. Register a Webex Integration

Go to the [Webex Developer Portal](https://developer.webex.com/my-apps) and click
**Create a New App → Integration**.

Fill in the details:

| Field | Value |
|---|---|
| Integration name | `tiny-teams-with-tokens` (or your org's name) |
| Contact email | Your email |
| Redirect URI(s) | `http://localhost:3000/apps/ttt/oauth/webex/callback` |
| Scopes | See table below |

**Required scopes:**

| Scope | Purpose |
|---|---|
| `meeting:schedules_read` | List meetings (dates, titles, state, whether transcript exists) |
| `meeting:transcripts_read` | Download meeting transcripts |
| `meeting:preferences_read` | Read user meeting preferences |

After saving, Webex shows the **Client ID** and **Client Secret**. The client ID is
hardcoded in `backend/ttt/config.py`; you need the secret:

```
webex_client_id = "Cfc1a9f01289f8e16eefd3cd1ecabf8a96f2fdbbc7f62c726efaf9e12ca96ad00"
```

If you are deploying the app under your own Webex integration (not the shared one), replace
`WEBEX_CLIENT_ID` in `.env` to override the hardcoded default.

### 2. Set `WEBEX_CLIENT_SECRET` in `.env`

```
WEBEX_CLIENT_SECRET=<secret from the developer portal>
```

This is required for token refresh. Without it, per-project tokens stop working when the
access token expires and the system falls back to `WEBEX_TOKEN` (or no auth).

### 3. Set the redirect URI (non-localhost deploys only)

The default redirect URI is `http://localhost:3000/apps/ttt/oauth/webex/callback`. For any
other hostname, update both your Webex integration and `.env`:

```
WEBEX_REDIRECT_URI=https://your-host/apps/ttt/oauth/webex/callback
```

The URI in `.env` must exactly match one of the Redirect URI(s) registered in the Webex
developer portal.

### 4. How users connect Webex in the wizard

When creating a project, users see a **Connect Webex** button in the Webex Meetings step.
Clicking it opens a Webex OAuth popup. After authorizing, the wizard lists the user's meetings
from the last 30 days and lets them select which ones to include in the project.

Only ended meetings (`state=ended`) of type `meeting` (not webinars or events) are shown.
Meetings with a transcript or AI summary are flagged with icons so users can identify
which ones have useful content to ingest.

The session token is stored against the project at creation time. After project creation,
Webex can also be connected from the project settings page for any project that was created
without it.

---

## Option B — Personal / bot token

Use this path for single-user local development or for a bot account that attends all meetings.

### 1. Obtain a personal access token

**For development (short-lived — 12 hours):**

Go to [https://developer.webex.com](https://developer.webex.com), sign in, and click
**Documentation → Getting Started**. Your personal access token appears on that page.
It expires after 12 hours — not suitable for production.

**For longer-lived access:**

Personal tokens for production are not officially supported by Webex. Use OAuth (Option A)
for any deployment beyond a single local test session.

**For a bot account:**

Create a bot at [https://developer.webex.com/my-apps](https://developer.webex.com/my-apps)
→ **Create a New App → Bot**. Bot tokens do not expire, but bots must be added to each
meeting space to access transcripts. This is typically only useful if the bot account was
explicitly invited to the relevant meetings.

### 2. Add the token to `.env`

```
WEBEX_TOKEN=<your personal or bot token>
```

### 3. Restart the backend

```bash
docker compose restart backend
```

---

## Checking which credential path is active

### From the wizard

The Webex Meetings step shows a **Connect Webex** button. After connecting, meetings from the
last 30 days are listed. If the button appears but meetings do not load after connecting, the
token lacks the required scopes or the account has no recent ended meetings.

### From the API (project-level)

```bash
curl http://localhost:8765/api/projects/<project_id>/oauth/webex/status
```

Returns:

```json
{
  "connected": true,
  "expires_at": "2026-06-05T18:00:00",
  "scope": "meeting:schedules_read meeting:transcripts_read meeting:preferences_read"
}
```

`connected: false` means no per-project OAuth token; the system will use `WEBEX_TOKEN` from
`.env` if set.

---

## Summary of required `.env` entries

```bash
# Option A — Webex OAuth 2.0 (recommended)
WEBEX_CLIENT_SECRET=<client secret from developer.webex.com>
WEBEX_REDIRECT_URI=https://your-host/apps/ttt/oauth/webex/callback  # only if not localhost

# Only needed if using your own Webex integration (not the shared app)
# WEBEX_CLIENT_ID=<your integration's client ID>

# Option B — Personal / bot token (dev or single-user only)
WEBEX_TOKEN=<personal access token or bot token>
```

You can set both. The per-project OAuth token takes priority; `WEBEX_TOKEN` is the fallback.

---

## What TTT reads from Webex

The ingest agent uses the Webex MCP tools to read:

| Tool | What it fetches |
|---|---|
| `webex_meetings_list_meetings` | Ended meetings in the last 30 days: title, start/end time, host, whether transcript/summary exists |
| `webex_meetings_list_transcripts` | Transcript records for a specific meeting |
| `webex_meetings_get_summary` | AI-generated summary for a meeting: summary text, highlights, action items, keywords |

For each meeting selected during project creation, the agent retrieves the transcript and
AI summary and writes them to the wiki under `webex/<space-slug>/`. The meeting transcript
is combined with the summary and stored as a single Markdown page per meeting, with
frontmatter capturing the meeting ID, date, title, and transcript ID.

Only meetings that the authenticating user hosted or was invited to are accessible. The Webex
API does not expose transcripts for meetings the user did not attend.

---

## Token lifetime and refresh

Webex OAuth access tokens are short-lived. The system stores a refresh token alongside the
access token and calls the refresh endpoint automatically when the access token expires.
The refresh token itself also expires (the `refresh_token_expires_at` field tracks this).

When the refresh token expires, the user must reconnect Webex from the project settings page.
`WEBEX_CLIENT_SECRET` must be set for any refresh to succeed.

| Token type | Lifetime |
|---|---|
| Access token | Short (hours) — auto-refreshed |
| Refresh token | Longer (weeks to months, Webex-controlled) — requires user re-auth when expired |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Connect Webex" popup opens but nothing happens | `WEBEX_CLIENT_SECRET` not set, or redirect URI mismatch | Set `WEBEX_CLIENT_SECRET`; verify callback URL matches the Webex integration exactly |
| Meetings list is empty after connecting | No ended meetings in the last 30 days, or account has no meetings | Verify with the Webex web app that ended meetings exist for the account |
| Transcript missing for a meeting | Meeting has no transcript, or the transcription feature was not enabled for the space | Check that transcription is enabled in the Webex space settings; re-run the meeting with transcription on |
| Ingest stops fetching Webex data after a while | OAuth access token expired and `WEBEX_CLIENT_SECRET` not set for refresh | Set `WEBEX_CLIENT_SECRET`; user reconnects Webex from project settings |
| `WEBEX_TOKEN` works in curl but not in ingest | Token is logged (which is why the code explicitly avoids it) or the token expired | Personal dev tokens expire after 12 hours; switch to OAuth for reliable access |
| "webex_token is not configured" in ingest log | No per-project OAuth token AND no `WEBEX_TOKEN` env var | Set `WEBEX_TOKEN` or connect Webex via OAuth in the project settings |
| Bot token can't access transcripts | Bot was not invited to the meeting space | Add the bot to the Webex space before the meeting, or use a personal OAuth token instead |
