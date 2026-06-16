import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.authz import assert_project_role, get_accessible_project_ids, get_current_ctx
from ttt.db import get_session
from ttt.models import (
    ChatMessage,
    ChatSession,
    ConfluenceOAuthToken,
    ConfluenceSpace,
    GitHubOAuthToken,
    IngestRun,
    PageRevision,
    Project,
    ProjectGroupRole,
    ProjectMember,
    Repo,
    Report,
    WebexRoom,
)
from ttt.services import session_store
from ttt.services.projects import (
    ConfluenceSpaceOut,
    ProjectCreate,
    ProjectSummary,
    ProjectUpdate,
    RepoOut,
    WebexRoomOut,
    add_confluence_space,
    add_repo,
    add_webex_room,
    cancel_project_ingest,
    create_project_with_greenfield,
    fetch_caipe_project_summaries,
    list_project_confluence_spaces,
    list_project_repos,
    list_project_summaries,
    list_project_webex_rooms,
    reingest_project,
    summarize,
)

router = APIRouter(tags=["projects"])
log = logging.getLogger("ttt.api.projects")

__all__ = ["router", "ProjectCreate", "ProjectSummary", "ProjectUpdate"]


async def _store_forwarded_credentials(
    session: AsyncSession, project_id: UUID, credentials: dict[str, dict[str, str]]
) -> None:
    """Persist CAIPE-forwarded provider tokens as per-project OAuth rows.

    resolve_github_token / resolve_confluence_token will use these creds.
    Tokens are not refreshable here (no refresh_token); resolve_* falls back
    to the service token once they expire.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    def _expiry(entry: dict[str, str], default_seconds: int) -> datetime:
        try:
            secs = int(entry.get("expires_in", "") or default_seconds)
        except (TypeError, ValueError):
            secs = default_seconds
        return now + timedelta(seconds=max(60, secs))

    gh = credentials.get("github") or {}
    if gh.get("access_token"):
        row = (await session.exec(
            select(GitHubOAuthToken).where(GitHubOAuthToken.project_id == project_id)
        )).first()
        if not row:
            row = GitHubOAuthToken(
                project_id=project_id, access_token="", refresh_token="", expires_at=now
            )
        row.access_token = gh["access_token"]
        row.refresh_token = ""
        row.expires_at = _expiry(gh, 8 * 3600)
        session.add(row)

    atl = credentials.get("atlassian") or credentials.get("confluence") or {}
    if atl.get("access_token") and atl.get("cloud_id"):
        row = (await session.exec(
            select(ConfluenceOAuthToken).where(ConfluenceOAuthToken.project_id == project_id)
        )).first()
        if not row:
            row = ConfluenceOAuthToken(
                project_id=project_id,
                access_token="",
                refresh_token="",
                expires_at=now,
                cloud_id=atl["cloud_id"],
            )
        row.access_token = atl["access_token"]
        row.refresh_token = ""
        row.expires_at = _expiry(atl, 3600)
        row.cloud_id = atl["cloud_id"]
        row.site_url = atl.get("site_url", "") or row.site_url
        session.add(row)

    await session.commit()


@router.get("/projects", response_model=list[ProjectSummary])
async def list_projects(
    request: Request, session: AsyncSession = Depends(get_session)
) -> list[ProjectSummary]:
    ctx = get_current_ctx()
    if ctx is not None and ctx.sub:
        accessible = await get_accessible_project_ids(ctx.sub, ctx.groups, session)
    else:
        accessible = None  # no auth — return all
    local = await list_project_summaries(session, project_ids=accessible)

    # Multiplex: surface the CAIPE projects this same user can access so the UI
    # renders one unified list ("just projects"). Best-effort — never fails the
    # local list. Forward the user's bearer token (CAIPE enforces its own RBAC).
    token = getattr(ctx, "token", "") or ""
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    caipe = await fetch_caipe_project_summaries(token)
    seen = {s.name.strip().lower() for s in local}
    return local + [c for c in caipe if c.name.strip().lower() not in seen]


class ProjectCreateRequest(BaseModel):
    name: str
    charter: str = ""
    # Alias accepted from generic callers (e.g. CAIPE onboarding) that send a
    # product-agnostic `description`; used as the charter when charter is empty.
    description: str = ""
    phase: str | None = None
    cadence: str | None = None
    repos: list[str] = []
    connector_data: dict[str, Any] | None = None  # keyed by connector slug
    session_keys: dict[str, str] | None = None    # keyed by connector slug
    # Tokens forwarded by the CAIPE proxy from the signed-in user's Connections,
    # keyed by provider: {"github": {"access_token","expires_in"},
    # "atlassian": {"access_token","expires_in","cloud_id","site_url"}}. Stored
    # per-project so ingest acts with the user's own access (falls back to the
    # service token when absent/expired).
    credentials: dict[str, dict[str, str]] | None = None


@router.post("/projects", response_model=ProjectSummary)
async def create_project(
    body: ProjectCreateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ProjectSummary:
    _parse_connector_data(body.connector_data)

    ctx = get_current_ctx()
    creator_user_id = None
    if ctx is not None and ctx.sub:
        from sqlmodel import select as _select
        from ttt.models import User as _User
        user = (await session.exec(_select(_User).where(_User.sub == ctx.sub))).first()
        if user:
            creator_user_id = user.id

    create_body = ProjectCreate(
        name=body.name,
        charter=body.charter or body.description,
        phase=body.phase,
        cadence=body.cadence,
        repos=body.repos,
    )
    result = await create_project_with_greenfield(
        session,
        create_body,
        connector_data=body.connector_data,
        app=request.app,
        creator_user_id=creator_user_id,
    )
    await _associate_session_keys(body.session_keys or {}, result.id)
    if body.credentials:
        try:
            await _store_forwarded_credentials(session, result.id, body.credentials)
        except Exception:
            log.warning(
                "failed to store forwarded credentials for project %s", result.id, exc_info=True
            )
    return result


async def _associate_session_keys(session_keys: dict[str, str], project_id: UUID) -> None:
    """Associate any per-connector OAuth session keys with the new
    project. The agent never sees these — the OAuth flow lives in the
    backend, and resolved tokens are injected as env when the agent
    container starts."""
    from ttt.services.confluence_oauth import (
        associate_temp_token as associate_confluence_token,
    )
    from ttt.services.github_oauth import (
        associate_temp_token as associate_github_token,
    )
    from ttt.services.webex_oauth import (
        associate_temp_token as associate_webex_token,
    )

    associators = {
        "github": associate_github_token,
        "webex": associate_webex_token,
        "confluence": associate_confluence_token,
    }
    for slug, associate in associators.items():
        key = session_keys.get(slug)
        if key:
            await associate(key, project_id)


def _parse_connector_data(connector_data: dict[str, Any] | None) -> None:
    """Run each agent-side connector's parse_extra over its slot in
    connector_data. Raises HTTPException(422) on the first parse
    failure so bad payloads surface at the boundary instead of
    crashing mid-ingest."""
    from ttt.agent.connectors import REGISTRY

    if not connector_data:
        return
    for connector in REGISTRY:
        try:
            connector.parse_extra(connector_data.get(connector.slug))
        except (ValueError, ValidationError) as e:
            raise HTTPException(422, f"{connector.slug}: {e}") from e


@router.get("/projects/{project_id}")
async def get_project(project_id: UUID, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await assert_project_role(project_id, "viewer", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    summary = await summarize(session, project)
    latest_run = (await session.exec(
        select(IngestRun)
        .where(IngestRun.project_id == project_id)
        .order_by(col(IngestRun.started_at).desc())
    )).first()
    return {
        **summary.model_dump(mode="json"),
        "charter": project.charter,
        "ingest_config": project.ingest_config,
        "repos": [r.model_dump(mode="json") for r in await list_project_repos(session, project_id)],
        "webex_rooms": [
            r.model_dump(mode="json") for r in await list_project_webex_rooms(session, project_id)
        ],
        "confluence_spaces": [
            r.model_dump(mode="json")
            for r in await list_project_confluence_spaces(session, project_id)
        ],
        "latest_run_id": str(latest_run.id) if latest_run else None,
    }


@router.patch("/projects/{project_id}", response_model=ProjectSummary)
async def update_project(
    project_id: UUID, body: ProjectUpdate, session: AsyncSession = Depends(get_session)
) -> ProjectSummary:
    await assert_project_role(project_id, "admin", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(project, k, v)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return await summarize(session, project)


# ---------- sources: repos / webex / confluence ----------


class RepoCreate(BaseModel):
    url: str
    slug: str | None = None
    default_branch: str = "main"


@router.get("/projects/{project_id}/repos", response_model=list[RepoOut])
async def list_repos(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[RepoOut]:
    await assert_project_role(project_id, "viewer", session)
    return await list_project_repos(session, project_id)


@router.post("/projects/{project_id}/repos", response_model=RepoOut)
async def create_repo(
    project_id: UUID,
    body: RepoCreate,
    session: AsyncSession = Depends(get_session),
) -> RepoOut:
    await assert_project_role(project_id, "admin", session)
    return await add_repo(
        session,
        project_id,
        body.url,
        slug=body.slug,
        default_branch=body.default_branch,
    )


class WebexRoomCreate(BaseModel):
    name: str
    slug: str | None = None
    webex_id: str | None = None


@router.get("/projects/{project_id}/webex", response_model=list[WebexRoomOut])
async def list_webex_rooms(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[WebexRoomOut]:
    await assert_project_role(project_id, "viewer", session)
    return await list_project_webex_rooms(session, project_id)


@router.post("/projects/{project_id}/webex", response_model=WebexRoomOut)
async def create_webex_room(
    project_id: UUID,
    body: WebexRoomCreate,
    session: AsyncSession = Depends(get_session),
) -> WebexRoomOut:
    await assert_project_role(project_id, "admin", session)
    return await add_webex_room(
        session, project_id, body.name, slug=body.slug, webex_id=body.webex_id
    )


class ConfluenceSpaceCreate(BaseModel):
    name: str
    space_key: str
    slug: str | None = None
    base_url: str = ""


@router.get("/projects/{project_id}/confluence", response_model=list[ConfluenceSpaceOut])
async def list_confluence_spaces(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[ConfluenceSpaceOut]:
    await assert_project_role(project_id, "viewer", session)
    return await list_project_confluence_spaces(session, project_id)


@router.post("/projects/{project_id}/confluence", response_model=ConfluenceSpaceOut)
async def create_confluence_space(
    project_id: UUID,
    body: ConfluenceSpaceCreate,
    session: AsyncSession = Depends(get_session),
) -> ConfluenceSpaceOut:
    await assert_project_role(project_id, "admin", session)
    return await add_confluence_space(
        session,
        project_id,
        body.name,
        body.space_key,
        slug=body.slug,
        base_url=body.base_url,
    )


# ---------- ingest lifecycle ----------


class ReingestRequest(BaseModel):
    seed: str | None = None
    connector_data: dict[str, Any] | None = None  # keyed by connector slug


@router.post("/projects/{project_id}/reingest")
async def reingest(
    project_id: UUID,
    request: Request,
    body: ReingestRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await assert_project_role(project_id, "editor", session)
    seed = body.seed if body else None
    connector_data = body.connector_data if body else None
    _parse_connector_data(connector_data)
    ref = await reingest_project(
        session,
        project_id,
        seed=seed,
        connector_data=connector_data,
        app=request.app,
    )
    return {"run_id": str(ref.run_id), "status": ref.status}


@router.get("/projects/{project_id}/webex/meetings")
async def list_webex_meetings(project_id: UUID) -> list[dict[str, Any]]:
    """List recent ended meetings via the project's Webex OAuth token."""
    from ttt.services.webex_oauth import resolve_webex_token

    token = await resolve_webex_token(project_id)
    if not token:
        raise HTTPException(status_code=400, detail="Webex not connected")

    now = datetime.now(timezone.utc)
    from_date = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    to_date = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://webexapis.com/v1/meetings",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "state": "ended",
                    "meetingType": "meeting",
                    "from": from_date,
                    "to": to_date,
                    "max": 50,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Webex API error: {e.response.status_code}")

    return [
        {
            "id": m.get("id"),
            "title": m.get("title"),
            "start": m.get("start"),
            "end": m.get("end"),
            "hostDisplayName": m.get("hostDisplayName"),
            "meetingType": m.get("meetingType"),
            "hasTranscription": bool(m.get("hasTranscription")),
            "hasSummary": bool(m.get("hasSummary") or m.get("hasTranscription")),
        }
        for m in (data.get("items") or [])
    ]


@router.get("/webex/meetings")
async def list_webex_meetings_global(session_key: str | None = None) -> list[dict[str, Any]]:
    """List recent ended meetings using the .env token or a temp session token."""
    from ttt.services.webex_oauth import get_temp_token

    from ttt.config import settings as _settings

    token = None
    if session_key:
        token = get_temp_token(session_key)
    if not token:
        token = _settings.webex_token
    if not token:
        raise HTTPException(status_code=400, detail="Webex not connected")

    now = datetime.now(timezone.utc)
    from_date = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    to_date = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://webexapis.com/v1/meetings",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "state": "ended",
                    "meetingType": "meeting",
                    "from": from_date,
                    "to": to_date,
                    "max": 50,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Webex API error: {e.response.status_code}")

    return [
        {
            "id": m.get("id"),
            "title": m.get("title"),
            "start": m.get("start"),
            "end": m.get("end"),
            "hostDisplayName": m.get("hostDisplayName"),
            "meetingType": m.get("meetingType"),
            "hasTranscription": bool(m.get("hasTranscription")),
            "hasSummary": bool(m.get("hasSummary") or m.get("hasTranscription")),
        }
        for m in (data.get("items") or [])
    ]


@router.get("/projects/{project_id}/confluence/spaces")
async def list_confluence_spaces_for_project(project_id: UUID) -> list[dict[str, Any]]:
    """List Confluence spaces via the project's OAuth token."""
    from ttt.services.confluence_oauth import resolve_confluence_cloud_id, resolve_confluence_token

    token = await resolve_confluence_token(project_id)
    cloud_id = await resolve_confluence_cloud_id(project_id)
    if not token or not cloud_id:
        raise HTTPException(status_code=400, detail="Confluence not connected")

    url = f"https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/api/v2/spaces"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                params={"limit": 50, "sort": "name"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Confluence API error: {e.response.status_code}")

    return [
        {"id": s.get("id"), "key": s.get("key"), "name": s.get("name"), "type": s.get("type"), "status": s.get("status")}
        for s in (data.get("results") or [])
    ]


@router.get("/projects/{project_id}/confluence/spaces/{space_id}/pages")
async def list_confluence_pages_for_project(project_id: UUID, space_id: str) -> list[dict[str, Any]]:
    """List pages in a Confluence space via the project's OAuth token."""
    from ttt.services.confluence_oauth import resolve_confluence_cloud_id, resolve_confluence_token

    token = await resolve_confluence_token(project_id)
    cloud_id = await resolve_confluence_cloud_id(project_id)
    if not token or not cloud_id:
        raise HTTPException(status_code=400, detail="Confluence not connected")

    url = f"https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/api/v2/spaces/{space_id}/pages"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                params={"limit": 50, "sort": "title"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Confluence API error: {e.response.status_code}")

    return [
        {"id": p.get("id"), "title": p.get("title"), "status": p.get("status"), "spaceId": p.get("spaceId"), "parentId": p.get("parentId")}
        for p in (data.get("results") or [])
    ]


@router.get("/confluence/spaces")
async def list_confluence_spaces_global(session_key: str | None = None) -> list[dict[str, Any]]:
    """List Confluence spaces using a temp session token or .env fallback."""
    from ttt.services.confluence_oauth import get_temp_token

    from ttt.config import settings as _settings

    token = None
    cloud_id = None
    if session_key:
        entry = get_temp_token(session_key)
        if entry:
            token = entry["access_token"]
            cloud_id = entry["cloud_id"]
    if not token:
        token = _settings.confluence_token
    if not token or not cloud_id:
        raise HTTPException(status_code=400, detail="Confluence not connected")

    url = f"https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/api/v2/spaces"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                params={"limit": 50, "sort": "name"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Confluence API error: {e.response.status_code}")

    return [
        {"id": s.get("id"), "key": s.get("key"), "name": s.get("name"), "type": s.get("type"), "status": s.get("status")}
        for s in (data.get("results") or [])
    ]


@router.get("/confluence/spaces/{space_id}/pages")
async def list_confluence_pages_global(space_id: str, session_key: str | None = None) -> list[dict[str, Any]]:
    """List pages in a Confluence space using a temp session token or .env fallback."""
    from ttt.services.confluence_oauth import get_temp_token

    from ttt.config import settings as _settings

    token = None
    cloud_id = None
    if session_key:
        entry = get_temp_token(session_key)
        if entry:
            token = entry["access_token"]
            cloud_id = entry["cloud_id"]
    if not token:
        token = _settings.confluence_token
    if not token or not cloud_id:
        raise HTTPException(status_code=400, detail="Confluence not connected")

    url = f"https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/api/v2/spaces/{space_id}/pages"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                params={"limit": 50, "sort": "title"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Confluence API error: {e.response.status_code}")

    return [
        {"id": p.get("id"), "title": p.get("title"), "status": p.get("status"), "spaceId": p.get("spaceId"), "parentId": p.get("parentId")}
        for p in (data.get("results") or [])
    ]


@router.get("/projects/{project_id}/ingests")
async def list_ingests(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[dict[str, Any]]:
    await assert_project_role(project_id, "viewer", session)
    runs = (await session.exec(
        select(IngestRun)
        .where(IngestRun.project_id == project_id)
        .order_by(col(IngestRun.started_at).desc())
    )).all()
    return [
        {
            "id": str(r.id),
            "status": r.status,
            "started_at": r.started_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "error": r.error,
            "log_lines": (r.log or "").count("\n"),
        }
        for r in runs
    ]


@router.post("/projects/{project_id}/ingest/cancel")
async def cancel_ingest(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    await assert_project_role(project_id, "editor", session)
    return await cancel_project_ingest(session, project_id)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: UUID, session: AsyncSession = Depends(get_session)) -> None:
    await assert_project_role(project_id, "admin", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")

    for model in (
        ChatMessage,
        ChatSession,
        PageRevision,
        IngestRun,
        Report,
        Repo,
        WebexRoom,
        ConfluenceSpace,
        ProjectMember,
        ProjectGroupRole,
    ):
        rows = (await session.exec(select(model).where(model.project_id == project_id))).all()
        for row in rows:
            await session.delete(row)

    await session.delete(project)
    await session.commit()

    wiki_dir = Path("data/wiki") / str(project_id)
    if wiki_dir.exists():
        shutil.rmtree(wiki_dir)

    # Remove the durable chat-session transcript store for this project.
    session_store.evict(project_id)


@router.get("/ingest/{run_id}")
async def get_ingest(run_id: UUID, session: AsyncSession = Depends(get_session)) -> IngestRun:
    run = await session.get(IngestRun, run_id)
    if not run:
        raise HTTPException(404, "ingest run not found")
    return run
