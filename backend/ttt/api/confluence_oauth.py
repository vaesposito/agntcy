"""OAuth2 API routes for Confluence per-project and global authorization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ttt.services import confluence_oauth

router = APIRouter(prefix="/projects/{project_id}/oauth/confluence", tags=["oauth"])
global_router = APIRouter(prefix="/oauth/confluence", tags=["oauth"])


class CodeExchange(BaseModel):
    code: str
    state: str


@router.get("/authorize")
def get_authorize_url(project_id: UUID) -> dict:
    """Return the Atlassian OAuth authorize URL."""
    try:
        url = confluence_oauth.start_authorize(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url}


@router.post("/token")
async def exchange_token(project_id: UUID, body: CodeExchange) -> dict:
    """Exchange authorization code for access/refresh tokens."""
    try:
        await confluence_oauth.exchange_code(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok"}


@router.get("/status")
async def get_oauth_status(project_id: UUID) -> dict:
    """Check whether the project has a valid Confluence OAuth token."""
    return await confluence_oauth.get_oauth_status(project_id)


@router.delete("/")
async def revoke_token(project_id: UUID) -> dict:
    """Delete stored OAuth token for the project."""
    await confluence_oauth.delete_token(project_id)
    return {"status": "revoked"}


# ---------- Global endpoints (no project_id, for use during project creation) ----------


@global_router.get("/status")
def global_confluence_status() -> dict:
    """Check if a Confluence token is available globally (from .env)."""
    return {"connected": confluence_oauth.global_confluence_connected()}


@global_router.get("/authorize")
def global_authorize() -> dict:
    """Start an OAuth flow not tied to a project. Returns authorize_url + session_key."""
    try:
        url, session_key = confluence_oauth.start_authorize_global()
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
        session_key = await confluence_oauth.exchange_code_global(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok", "session_key": session_key}
