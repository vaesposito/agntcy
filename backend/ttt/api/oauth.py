"""OAuth2 API routes for Webex per-project and global authorization."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.db import engine
from ttt.services import webex_oauth

router = APIRouter(prefix="/projects/{project_id}/oauth/webex", tags=["oauth"])
global_router = APIRouter(prefix="/oauth/webex", tags=["oauth"])


class CodeExchange(BaseModel):
    code: str
    state: str


@router.get("/authorize")
def get_authorize_url(project_id: UUID) -> dict:
    """Return the Webex OAuth authorize URL with PKCE challenge."""
    try:
        url = webex_oauth.start_authorize(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url}


@router.post("/token")
async def exchange_token(project_id: UUID, body: CodeExchange) -> dict:
    """Exchange authorization code for access/refresh tokens."""
    try:
        await webex_oauth.exchange_code(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok"}


@router.get("/status")
async def get_oauth_status(project_id: UUID) -> dict:
    """Check whether the project has a valid Webex OAuth token."""
    from ttt.models import WebexOAuthToken

    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (await session.exec(
            select(WebexOAuthToken).where(WebexOAuthToken.project_id == project_id)
        )).first()

    if not token_row:
        return {"connected": False, "expires_at": None, "scope": ""}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return {
        "connected": token_row.expires_at > now,
        "expires_at": token_row.expires_at.isoformat(),
        "scope": token_row.scope,
    }


@router.delete("/")
async def revoke_token(project_id: UUID) -> dict:
    """Delete stored OAuth token for the project."""
    from ttt.models import WebexOAuthToken

    async with AsyncSession(engine, expire_on_commit=False) as session:
        token_row = (await session.exec(
            select(WebexOAuthToken).where(WebexOAuthToken.project_id == project_id)
        )).first()
        if token_row:
            await session.delete(token_row)
            await session.commit()
    return {"status": "revoked"}


# ---------- Global endpoints (no project_id, for use during project creation) ----------


@global_router.get("/status")
def global_webex_status() -> dict:
    """Check if a Webex token is available globally (from .env)."""
    return {"connected": webex_oauth.global_webex_connected()}


@global_router.get("/authorize")
def global_authorize() -> dict:
    """Start an OAuth flow not tied to a project. Returns authorize_url + session_key."""
    try:
        url, session_key = webex_oauth.start_authorize_global()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url, "session_key": session_key}


class GlobalCodeExchange(BaseModel):
    code: str
    state: str
    session_key: str


@global_router.post("/token")
async def global_exchange_token(body: GlobalCodeExchange) -> dict:
    """Exchange code for a global (non-project) flow. Returns the session_key."""
    try:
        session_key = await webex_oauth.exchange_code_global(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok", "session_key": session_key}
