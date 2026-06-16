"""OAuth2 API routes for GitHub per-project and global authorization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ttt.services import github_oauth

router = APIRouter(prefix="/projects/{project_id}/oauth/github", tags=["oauth"])
global_router = APIRouter(prefix="/oauth/github", tags=["oauth"])


class CodeExchange(BaseModel):
    code: str
    state: str


@router.get("/authorize")
def get_authorize_url(project_id: UUID) -> dict:
    """Return the GitHub OAuth authorize URL with PKCE challenge."""
    try:
        url = github_oauth.start_authorize(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"authorize_url": url}


@router.post("/token")
async def exchange_token(project_id: UUID, body: CodeExchange) -> dict:
    """Exchange authorization code for access/refresh tokens."""
    try:
        await github_oauth.exchange_code(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok"}


@router.get("/status")
async def get_oauth_status(project_id: UUID) -> dict:
    """Check whether the project has a valid GitHub OAuth token."""
    return await github_oauth.get_oauth_status(project_id)


@router.delete("/")
async def revoke_token(project_id: UUID) -> dict:
    """Delete stored OAuth token for the project."""
    await github_oauth.delete_token(project_id)
    return {"status": "revoked"}


# ---------- Global endpoints (no project_id, for use during project creation) ----------


@global_router.get("/status")
def global_github_status() -> dict:
    """Check if a GitHub token is available globally (from .env)."""
    return {"connected": github_oauth.global_github_connected(), "github_login": None}


@global_router.get("/authorize")
def global_authorize() -> dict:
    """Start an OAuth flow not tied to a project. Returns authorize_url + session_key."""
    try:
        url, session_key = github_oauth.start_authorize_global()
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
        session_key = await github_oauth.exchange_code_global(body.state, body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e}")
    return {"status": "ok", "session_key": session_key}
