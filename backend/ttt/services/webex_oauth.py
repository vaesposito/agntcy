"""OAuth2 Authorization Code Flow with PKCE for the Webex API.

Handles PKCE generation, authorization URL construction, token exchange,
refresh, and per-project token resolution (with .env fallback).
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
from ttt.models import WebexOAuthToken

log = logging.getLogger("ttt.webex_oauth")

AUTHORIZE_URL = "https://webexapis.com/v1/authorize"
TOKEN_URL = "https://webexapis.com/v1/access_token"

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


def generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def start_authorize(project_id: UUID) -> str:
    """Generate PKCE params, store state, return the full Webex authorize URL."""
    _cleanup_expired_flows()

    if not settings.webex_client_id:
        raise ValueError("WEBEX_CLIENT_ID is not configured")

    verifier, challenge = generate_pkce()
    state = secrets.token_urlsafe(32)

    _pending_flows[state] = {
        "code_verifier": verifier,
        "project_id": str(project_id),
        "created_at": time.time(),
    }

    params = {
        "response_type": "code",
        "client_id": settings.webex_client_id,
        "redirect_uri": settings.webex_redirect_uri,
        "scope": settings.webex_scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(state: str, code: str) -> WebexOAuthToken:
    """Exchange authorization code for tokens using the stored PKCE verifier."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    project_id = UUID(flow["project_id"])
    code_verifier = flow["code_verifier"]

    payload = {
        "grant_type": "authorization_code",
        "client_id": settings.webex_client_id,
        "client_secret": settings.webex_client_secret,
        "code": code,
        "redirect_uri": settings.webex_redirect_uri,
        "code_verifier": code_verifier,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, data=payload)
        resp.raise_for_status()
        data = resp.json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=data["expires_in"])
    refresh_expires_at = (
        now + timedelta(seconds=data["refresh_token_expires_in"])
        if "refresh_token_expires_in" in data
        else None
    )

    async with AsyncSession(engine, expire_on_commit=False) as session:
        existing = (
            await session.exec(
                select(WebexOAuthToken).where(WebexOAuthToken.project_id == project_id)
            )
        ).first()
        if existing:
            existing.access_token = data["access_token"]
            existing.refresh_token = data["refresh_token"]
            existing.expires_at = expires_at
            existing.refresh_token_expires_at = refresh_expires_at
            existing.scope = data.get("scope", "")
            existing.updated_at = now
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
            return existing

        token_row = WebexOAuthToken(
            project_id=project_id,
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=expires_at,
            refresh_token_expires_at=refresh_expires_at,
            scope=data.get("scope", ""),
        )
        session.add(token_row)
        await session.commit()
        await session.refresh(token_row)
        return token_row


async def refresh_token(token_row: WebexOAuthToken) -> WebexOAuthToken:
    """Refresh an expired access token using the refresh_token grant."""
    payload = {
        "grant_type": "refresh_token",
        "client_id": settings.webex_client_id,
        "client_secret": settings.webex_client_secret,
        "refresh_token": token_row.refresh_token,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, data=payload)
        resp.raise_for_status()
        data = resp.json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        session.add(token_row)
        token_row.access_token = data["access_token"]
        token_row.refresh_token = data.get("refresh_token", token_row.refresh_token)
        token_row.expires_at = now + timedelta(seconds=data["expires_in"])
        if "refresh_token_expires_in" in data:
            token_row.refresh_token_expires_at = now + timedelta(seconds=data["refresh_token_expires_in"])
        token_row.updated_at = now
        await session.commit()
        await session.refresh(token_row)
    return token_row


async def resolve_webex_token(project_id: UUID) -> str:
    """Return a valid Webex access token for the project.

    Priority: per-project OAuth token (refreshed if expired) > settings.webex_token.
    Returns empty string if neither is available.
    """
    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (
            await session.exec(
                select(WebexOAuthToken).where(WebexOAuthToken.project_id == project_id)
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
            log.warning("failed to refresh Webex OAuth token for project %s", project_id, exc_info=True)

    return settings.webex_token


def start_authorize_global() -> tuple[str, str]:
    """Start an OAuth flow not tied to a project. Returns (authorize_url, session_key).
    The session_key is sent back by the client when creating the project."""
    _cleanup_expired_flows()

    if not settings.webex_client_id:
        raise ValueError("WEBEX_CLIENT_ID is not configured")

    verifier, challenge = generate_pkce()
    state = secrets.token_urlsafe(32)
    session_key = secrets.token_urlsafe(24)

    _pending_flows[state] = {
        "code_verifier": verifier,
        "project_id": None,
        "session_key": session_key,
        "created_at": time.time(),
    }

    params = {
        "response_type": "code",
        "client_id": settings.webex_client_id,
        "redirect_uri": settings.webex_redirect_uri,
        "scope": settings.webex_scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}", session_key


async def exchange_code_global(state: str, code: str) -> str:
    """Exchange code for a flow not tied to a project. Stores the token in
    memory under its session_key. Returns the session_key."""
    _cleanup_expired_flows()

    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state")

    session_key = flow["session_key"]
    code_verifier = flow["code_verifier"]

    payload = {
        "grant_type": "authorization_code",
        "client_id": settings.webex_client_id,
        "client_secret": settings.webex_client_secret,
        "code": code,
        "redirect_uri": settings.webex_redirect_uri,
        "code_verifier": code_verifier,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(TOKEN_URL, data=payload)
        resp.raise_for_status()
        data = resp.json()

    _cleanup_expired_temp_tokens()
    _temp_tokens[session_key] = {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_in": data["expires_in"],
        "refresh_token_expires_in": data.get("refresh_token_expires_in"),
        "scope": data.get("scope", ""),
        "created_at": time.time(),
    }
    return session_key


def get_temp_token(session_key: str) -> str | None:
    """Return the access token for a temp session, or None if not found/expired."""
    _cleanup_expired_temp_tokens()
    entry = _temp_tokens.get(session_key)
    if not entry:
        return None
    return entry["access_token"]


async def associate_temp_token(session_key: str, project_id: UUID) -> None:
    """Move a temp token into the DB for a newly created project."""
    _cleanup_expired_temp_tokens()
    entry = _temp_tokens.pop(session_key, None)
    if not entry:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=entry["expires_in"])
    refresh_expires_at = (
        now + timedelta(seconds=entry["refresh_token_expires_in"])
        if entry.get("refresh_token_expires_in")
        else None
    )

    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = WebexOAuthToken(
            project_id=project_id,
            access_token=entry["access_token"],
            refresh_token=entry["refresh_token"],
            expires_at=expires_at,
            refresh_token_expires_at=refresh_expires_at,
            scope=entry.get("scope", ""),
        )
        session.add(token_row)
        await session.commit()


def global_webex_connected() -> bool:
    """Check if a Webex token is available globally (from .env)."""
    return bool(settings.webex_token)
