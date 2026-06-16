"""OAuth2 Authorization Code Flow (3LO) for the Atlassian/Confluence API.

Atlassian uses standard OAuth2 with client_secret (no PKCE). After token
exchange, we call the accessible-resources endpoint to get the cloud_id
needed for Confluence REST API v2 calls.
"""

from __future__ import annotations

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
from ttt.models import ConfluenceOAuthToken

log = logging.getLogger("ttt.confluence_oauth")

AUTHORIZE_URL = "https://auth.atlassian.com/authorize"
TOKEN_URL = "https://auth.atlassian.com/oauth/token"
RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"

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


def start_authorize(project_id: UUID) -> str:
    """Build the Atlassian authorize URL. Returns the full URL to redirect to."""
    _cleanup_expired_flows()

    if not settings.confluence_client_id:
        raise ValueError("CONFLUENCE_CLIENT_ID is not configured")

    state = secrets.token_urlsafe(32)

    _pending_flows[state] = {
        "project_id": str(project_id),
        "created_at": time.time(),
    }

    params = {
        "audience": "api.atlassian.com",
        "client_id": settings.confluence_client_id,
        "scope": settings.confluence_scopes,
        "redirect_uri": settings.confluence_redirect_uri,
        "state": state,
        "response_type": "code",
        "prompt": "consent",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def _fetch_accessible_resources(access_token: str) -> tuple[str, str]:
    """Call the accessible-resources endpoint to get (cloud_id, site_url)."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            RESOURCES_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        resp.raise_for_status()
        resources = resp.json()

    if not resources:
        raise ValueError("No accessible Atlassian resources found for this account")

    first = resources[0]
    return first["id"], first.get("url", "")


async def exchange_code(state: str, code: str) -> ConfluenceOAuthToken:
    """Exchange authorization code for tokens, fetch cloud_id, persist to DB."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    project_id = UUID(flow["project_id"])

    payload = {
        "grant_type": "authorization_code",
        "client_id": settings.confluence_client_id,
        "client_secret": settings.confluence_client_secret,
        "code": code,
        "redirect_uri": settings.confluence_redirect_uri,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    cloud_id, site_url = await _fetch_accessible_resources(data["access_token"])

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=data["expires_in"])

    async with AsyncSession(engine, expire_on_commit=False) as session:
        existing = (
            await session.exec(
                select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
            )
        ).first()
        if existing:
            existing.access_token = data["access_token"]
            existing.refresh_token = data["refresh_token"]
            existing.expires_at = expires_at
            existing.cloud_id = cloud_id
            existing.site_url = site_url
            existing.scope = data.get("scope", "")
            existing.updated_at = now
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
            return existing

        token_row = ConfluenceOAuthToken(
            project_id=project_id,
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=expires_at,
            cloud_id=cloud_id,
            site_url=site_url,
            scope=data.get("scope", ""),
        )
        session.add(token_row)
        await session.commit()
        await session.refresh(token_row)
        return token_row


async def refresh_token(token_row: ConfluenceOAuthToken) -> ConfluenceOAuthToken:
    """Refresh an expired access token."""
    payload = {
        "grant_type": "refresh_token",
        "client_id": settings.confluence_client_id,
        "client_secret": settings.confluence_client_secret,
        "refresh_token": token_row.refresh_token,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add(token_row)
        token_row.access_token = data["access_token"]
        token_row.refresh_token = data.get("refresh_token", token_row.refresh_token)
        token_row.expires_at = now + timedelta(seconds=data["expires_in"])
        token_row.updated_at = now
        await session.commit()
        await session.refresh(token_row)
    return token_row


async def resolve_confluence_token(project_id: UUID) -> str:
    """Return a valid Confluence access token for the project.

    Auto-refreshes if expired. Returns empty string if no token available.
    """
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
            )
        ).first()

    if token_row:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if token_row.expires_at > now:
            return token_row.access_token
        try:
            refreshed = await refresh_token(token_row)
            return refreshed.access_token
        except Exception:
            log.warning("failed to refresh Confluence OAuth token for project %s", project_id, exc_info=True)

    return settings.confluence_token


async def resolve_confluence_cloud_id(project_id: UUID) -> str:
    """Return the cloud_id for the project's Confluence site, or empty string."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
            )
        ).first()

    if token_row:
        return token_row.cloud_id
    return ""


async def get_oauth_status(project_id: UUID) -> dict:
    """Return OAuth connection status for the project."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
            )
        ).first()

    if not token_row:
        return {"connected": False, "expires_at": None, "scope": "", "site_url": None}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return {
        "connected": token_row.expires_at > now,
        "expires_at": token_row.expires_at.isoformat() if token_row.expires_at else None,
        "scope": token_row.scope,
        "site_url": token_row.site_url or None,
    }


async def delete_token(project_id: UUID) -> None:
    """Remove the Confluence OAuth token for a project."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
            )
        ).first()
        if token_row:
            await session.delete(token_row)
            await session.commit()


# --- Global (pre-project) flow ---


def start_authorize_global() -> tuple[str, str]:
    """Start an OAuth flow not tied to a project. Returns (authorize_url, session_key)."""
    _cleanup_expired_flows()

    if not settings.confluence_client_id:
        raise ValueError("CONFLUENCE_CLIENT_ID is not configured")

    state = secrets.token_urlsafe(32)
    session_key = secrets.token_urlsafe(24)

    _pending_flows[state] = {
        "project_id": None,
        "session_key": session_key,
        "created_at": time.time(),
    }

    params = {
        "audience": "api.atlassian.com",
        "client_id": settings.confluence_client_id,
        "scope": settings.confluence_scopes,
        "redirect_uri": settings.confluence_redirect_uri,
        "state": state,
        "response_type": "code",
        "prompt": "consent",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}", session_key


async def exchange_code_global(state: str, code: str) -> str:
    """Exchange code for a flow not tied to a project. Returns session_key."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    session_key = flow["session_key"]

    payload = {
        "grant_type": "authorization_code",
        "client_id": settings.confluence_client_id,
        "client_secret": settings.confluence_client_secret,
        "code": code,
        "redirect_uri": settings.confluence_redirect_uri,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    cloud_id, site_url = await _fetch_accessible_resources(data["access_token"])

    _cleanup_expired_temp_tokens()
    _temp_tokens[session_key] = {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_in": data["expires_in"],
        "scope": data.get("scope", ""),
        "cloud_id": cloud_id,
        "site_url": site_url,
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
        token_row = ConfluenceOAuthToken(
            project_id=project_id,
            access_token=entry["access_token"],
            refresh_token=entry["refresh_token"],
            expires_at=expires_at,
            cloud_id=entry["cloud_id"],
            site_url=entry.get("site_url", ""),
            scope=entry.get("scope", ""),
        )
        session.add(token_row)
        await session.commit()


def global_confluence_connected() -> bool:
    """Check if a Confluence token is available globally (from .env)."""
    return bool(settings.confluence_token)
