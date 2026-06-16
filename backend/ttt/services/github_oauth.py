"""OAuth2 Authorization Code Flow with PKCE for the GitHub API (via GitHub App).

GitHub App web flow: user authorizes → we exchange code for a user access token
(ghu_*) with refresh token (ghr_*). Access tokens expire after 8 hours; refresh
tokens after 6 months.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.config import settings
from ttt.db import engine
from ttt.models import GitHubOAuthToken

log = logging.getLogger("ttt.github_oauth")

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"

_pending_flows: dict[str, dict] = {}
_temp_tokens: dict[str, dict] = {}
_FLOW_TTL_SECONDS = 600
_TEMP_TOKEN_TTL_SECONDS = 1800


def _cleanup_expired_flows() -> None:
    now = time.time()
    expired = [k for k, v in _pending_flows.items() if now - v["created_at"] > _FLOW_TTL_SECONDS]
    for k in expired:
        del _pending_flows[k]


def _cleanup_expired_temp_tokens() -> None:
    now = time.time()
    expired = [k for k, v in _temp_tokens.items() if now - v["created_at"] > _TEMP_TOKEN_TTL_SECONDS]
    for k in expired:
        del _temp_tokens[k]


def _generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


async def _fetch_github_login(access_token: str) -> str:
    """Call GET /user to get the authenticated user's login."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        resp.raise_for_status()
        return resp.json().get("login", "")


def start_authorize(project_id: UUID) -> str:
    """Generate PKCE params, store state, return the full GitHub authorize URL."""
    _cleanup_expired_flows()

    if not settings.github_client_id:
        raise ValueError("GITHUB_CLIENT_ID is not configured")

    verifier, challenge = _generate_pkce()
    state = secrets.token_urlsafe(32)

    _pending_flows[state] = {
        "code_verifier": verifier,
        "project_id": str(project_id),
        "created_at": time.time(),
    }

    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(state: str, code: str) -> GitHubOAuthToken:
    """Exchange authorization code for tokens using the stored PKCE verifier."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    project_id = UUID(flow["project_id"])
    code_verifier = flow["code_verifier"]

    payload = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "code": code,
        "redirect_uri": settings.github_redirect_uri,
        "code_verifier": code_verifier,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data=payload,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise ValueError(f"GitHub token exchange failed: {data.get('error_description', data['error'])}")

    github_login = await _fetch_github_login(data["access_token"])

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=data.get("expires_in", 28800))

    async with AsyncSession(engine, expire_on_commit=False) as session:
        existing = (
            await session.exec(
                select(GitHubOAuthToken).where(GitHubOAuthToken.project_id == project_id)
            )
        ).first()
        if existing:
            existing.access_token = data["access_token"]
            existing.refresh_token = data.get("refresh_token", "")
            existing.expires_at = expires_at
            existing.github_login = github_login
            existing.updated_at = now
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
            return existing

        token_row = GitHubOAuthToken(
            project_id=project_id,
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token", ""),
            expires_at=expires_at,
            github_login=github_login,
        )
        session.add(token_row)
        await session.commit()
        await session.refresh(token_row)
        return token_row


async def refresh_token(token_row: GitHubOAuthToken) -> GitHubOAuthToken:
    """Refresh an expired access token using the refresh_token grant."""
    if not token_row.refresh_token:
        raise ValueError("No refresh token available")

    payload = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "grant_type": "refresh_token",
        "refresh_token": token_row.refresh_token,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data=payload,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise ValueError(f"GitHub refresh failed: {data.get('error_description', data['error'])}")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add(token_row)
        token_row.access_token = data["access_token"]
        token_row.refresh_token = data.get("refresh_token", token_row.refresh_token)
        token_row.expires_at = now + timedelta(seconds=data.get("expires_in", 28800))
        token_row.updated_at = now
        await session.commit()
        await session.refresh(token_row)
    return token_row


async def resolve_github_token(project_id: UUID) -> str:
    """Return a valid GitHub access token for the project.

    Priority: per-project OAuth token (refreshed if expired) > settings.github_token.
    Returns empty string if neither is available.
    """
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(GitHubOAuthToken).where(GitHubOAuthToken.project_id == project_id)
            )
        ).first()

    if token_row:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if token_row.expires_at > now:
            return token_row.access_token
        if token_row.refresh_token:
            try:
                refreshed = await refresh_token(token_row)
                return refreshed.access_token
            except Exception:
                log.warning("failed to refresh GitHub OAuth token for project %s", project_id, exc_info=True)
        # Refresh failed or no refresh token. Return the stored (expired) token so
        # GitHub API calls produce a clear 401 rather than an anonymous 404.
        # The 401 surfaces "reconnect GitHub" to the user; 404 looks like a missing repo.
        if settings.github_token:
            return settings.github_token
        return token_row.access_token

    return settings.github_token


async def get_oauth_status(project_id: UUID) -> dict:
    """Return OAuth connection status for the project."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(GitHubOAuthToken).where(GitHubOAuthToken.project_id == project_id)
            )
        ).first()

    if not token_row:
        return {"connected": False, "github_login": None, "expires_at": None}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return {
        "connected": token_row.expires_at > now or bool(token_row.refresh_token),
        "github_login": token_row.github_login or None,
        "expires_at": token_row.expires_at.isoformat() if token_row.expires_at else None,
    }


async def delete_token(project_id: UUID) -> None:
    """Remove the GitHub OAuth token for a project."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(GitHubOAuthToken).where(GitHubOAuthToken.project_id == project_id)
            )
        ).first()
        if token_row:
            await session.delete(token_row)
            await session.commit()


# --- Global (pre-project) flow ---


def start_authorize_global() -> tuple[str, str]:
    """Start an OAuth flow not tied to a project. Returns (authorize_url, session_key)."""
    _cleanup_expired_flows()

    if not settings.github_client_id:
        raise ValueError("GITHUB_CLIENT_ID is not configured")

    verifier, challenge = _generate_pkce()
    state = secrets.token_urlsafe(32)
    session_key = secrets.token_urlsafe(24)

    _pending_flows[state] = {
        "code_verifier": verifier,
        "project_id": None,
        "session_key": session_key,
        "created_at": time.time(),
    }

    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}", session_key


async def exchange_code_global(state: str, code: str) -> str:
    """Exchange code for a flow not tied to a project. Returns session_key."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    session_key = flow["session_key"]
    code_verifier = flow["code_verifier"]

    payload = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "code": code,
        "redirect_uri": settings.github_redirect_uri,
        "code_verifier": code_verifier,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data=payload,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise ValueError(f"GitHub token exchange failed: {data.get('error_description', data['error'])}")

    github_login = await _fetch_github_login(data["access_token"])

    _cleanup_expired_temp_tokens()
    _temp_tokens[session_key] = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_in": data.get("expires_in", 28800),
        "github_login": github_login,
        "created_at": time.time(),
    }
    return session_key


def get_temp_token(session_key: str) -> dict | None:
    """Return the temp token data for a session, or None if not found/expired."""
    _cleanup_expired_temp_tokens()
    return _temp_tokens.get(session_key)


async def associate_temp_token(session_key: str, project_id: UUID) -> None:
    """Move a temp token into the DB for a newly created project."""
    _cleanup_expired_temp_tokens()
    entry = _temp_tokens.pop(session_key, None)
    if not entry:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=entry["expires_in"])

    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = GitHubOAuthToken(
            project_id=project_id,
            access_token=entry["access_token"],
            refresh_token=entry.get("refresh_token", ""),
            expires_at=expires_at,
            github_login=entry.get("github_login", ""),
        )
        session.add(token_row)
        await session.commit()


def global_github_connected() -> bool:
    """Check if a GitHub token is available globally (from .env)."""
    return bool(settings.github_token)
