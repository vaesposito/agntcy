"""Project service — schemas + business logic shared between the HTTP API
and the MCP server. Keep the route handlers and tool wrappers thin; put
the actual work here so both surfaces bind to the same types and behavior.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.config import settings
from ttt.models import (
    ConfluenceSpace,
    IngestRun,
    Project,
    Repo,
    Report,
    WebexRoom,
)
from ttt.pipeline.runner import dispatch_ingest


# ---------- shared schemas ----------


class ProjectCreate(BaseModel):
    name: str
    charter: str = ""
    phase: str | None = None
    cadence: str | None = None
    repos: list[str] = []  # github URLs / "owner/name" strings; seeded as Repos
    user_bindings: dict[str, Any] = {}
    ingest_config: dict[str, Any] = {}


class ProjectUpdate(BaseModel):
    charter: str | None = None
    phase: str | None = None
    cadence: str | None = None
    user_bindings: dict[str, Any] | None = None
    ingest_config: dict[str, Any] | None = None


class ProjectSummary(BaseModel):
    id: UUID
    name: str
    locked: bool
    created_at: datetime
    phase: str | None
    cadence: str | None
    repo_count: int
    webex_room_count: int
    confluence_space_count: int
    latest_version: int | None
    latest_ingested_at: datetime | None
    # Origin: "local" (this TTT instance) or "caipe" (multiplexed in from CAIPE's
    # projects API) so the UI can render one unified list.
    source: str = "local"


class RepoOut(BaseModel):
    id: UUID
    project_id: UUID
    slug: str
    url: str
    default_branch: str


class WebexRoomOut(BaseModel):
    id: UUID
    project_id: UUID
    slug: str
    name: str
    webex_id: str | None


class ConfluenceSpaceOut(BaseModel):
    id: UUID
    project_id: UUID
    slug: str
    name: str
    space_key: str
    base_url: str


class IngestRunRef(BaseModel):
    run_id: UUID
    project_id: UUID
    status: str


class IngestRunDetail(BaseModel):
    run_id: UUID
    project_id: UUID
    status: str
    started_at: datetime
    finished_at: datetime | None
    error: str | None
    log: str


# ---------- slug helpers ----------


_SLUG_SAFE = re.compile(r"[^a-z0-9-]+")


def _slugify(raw: str) -> str:
    s = raw.strip().lower().replace("::", "-").replace("/", "-").replace("_", "-")
    s = re.sub(r"\s+", "-", s)
    s = _SLUG_SAFE.sub("", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "unnamed"


def _normalize_repo_url(raw: str) -> str:
    """`https://github.com/foo/bar.git` → `foo/bar`. Returns the canonical
    `owner/name` form. Leaves anything we can't parse alone."""
    s = raw.strip().rstrip("/")
    for prefix in ("https://github.com/", "github.com/"):
        if s.startswith(prefix):
            s = s[len(prefix):]
    if s.endswith(".git"):
        s = s[: -len(".git")]
    parts = s.split("/")
    if len(parts) >= 2 and parts[0] and parts[1]:
        return f"{parts[0]}/{parts[1]}"
    return s


def _repo_slug_from_url(url: str, taken: set[str]) -> str:
    canonical = _normalize_repo_url(url)
    parts = canonical.split("/")
    candidate = _slugify(parts[-1] if parts else canonical)
    if candidate not in taken:
        return candidate
    # Collision — fall back to owner-name
    if len(parts) >= 2:
        candidate = _slugify(f"{parts[0]}-{parts[1]}")
        if candidate not in taken:
            return candidate
    # Last resort: numeric suffix
    i = 2
    while f"{candidate}-{i}" in taken:
        i += 1
    return f"{candidate}-{i}"


# ---------- helpers ----------


async def _count(session: AsyncSession, model, project_id: UUID) -> int:
    return len((await session.exec(select(model).where(model.project_id == project_id))).all())


async def summarize(session: AsyncSession, project: Project) -> ProjectSummary:
    latest = (
        await session.exec(
            select(Report)
            .where(Report.project_id == project.id)
            .order_by(col(Report.version).desc())
        )
    ).first()
    return ProjectSummary(
        id=project.id,
        name=project.name,
        locked=project.locked,
        created_at=project.created_at,
        phase=project.phase,
        cadence=project.cadence,
        repo_count=await _count(session, Repo, project.id),
        webex_room_count=await _count(session, WebexRoom, project.id),
        confluence_space_count=await _count(session, ConfluenceSpace, project.id),
        latest_version=latest.version if latest else None,
        latest_ingested_at=latest.ingested_at if latest else None,
    )


def _parse_iso(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


async def fetch_caipe_project_summaries(token: str) -> list[ProjectSummary]:
    """Multiplex: list the CAIPE projects the user can access, mapped into
    ProjectSummary (``source="caipe"``).

    Best-effort and side-effect free: returns ``[]`` when CAIPE isn't configured,
    no user token is available, or the call fails — the local project list must
    never break because CAIPE is unreachable. Forwards the user's bearer token so
    CAIPE enforces its own RBAC (see PR #43 for the gateway-identity contract).
    """
    base = (settings.caipe_api_url or "").rstrip("/")
    if not base or not token:
        return []
    import httpx
    from uuid import NAMESPACE_URL, uuid5

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base}/api/projects",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
        if resp.status_code >= 400:
            return []
        body = resp.json()
    except Exception:
        return []

    data = body.get("data", body) if isinstance(body, dict) else {}
    rows = data.get("projects", []) if isinstance(data, dict) else []
    out: list[ProjectSummary] = []
    for p in rows:
        if not isinstance(p, dict):
            continue
        key = str(p.get("slug") or p.get("_id") or p.get("name") or "").strip()
        if not key:
            continue
        out.append(
            ProjectSummary(
                id=uuid5(NAMESPACE_URL, f"caipe:{key}"),
                name=str(p.get("title") or p.get("name") or key),
                locked=False,
                created_at=_parse_iso(p.get("created_at")),
                phase=None,
                cadence=None,
                repo_count=0,
                webex_room_count=0,
                confluence_space_count=0,
                latest_version=None,
                latest_ingested_at=None,
                source="caipe",
            )
        )
    return out


async def list_project_summaries(
    session: AsyncSession,
    project_ids: list[UUID] | None = None,
) -> list[ProjectSummary]:
    """Return summaries for all projects, or a filtered subset when project_ids is given."""
    stmt = select(Project)
    if project_ids is not None:
        stmt = stmt.where(col(Project.id).in_(project_ids))
    projects = (await session.exec(stmt)).all()
    return [await summarize(session, p) for p in projects]


async def list_project_repos(session: AsyncSession, project_id: UUID) -> list[RepoOut]:
    rows = (await session.exec(select(Repo).where(Repo.project_id == project_id))).all()
    return [
        RepoOut(
            id=r.id,
            project_id=r.project_id,
            slug=r.slug,
            url=r.url,
            default_branch=r.default_branch,
        )
        for r in rows
    ]


async def list_project_webex_rooms(session: AsyncSession, project_id: UUID) -> list[WebexRoomOut]:
    rows = (
        await session.exec(select(WebexRoom).where(WebexRoom.project_id == project_id))
    ).all()
    return [
        WebexRoomOut(
            id=r.id, project_id=r.project_id, slug=r.slug, name=r.name, webex_id=r.webex_id
        )
        for r in rows
    ]


async def list_project_confluence_spaces(
    session: AsyncSession, project_id: UUID
) -> list[ConfluenceSpaceOut]:
    rows = (
        await session.exec(
            select(ConfluenceSpace).where(ConfluenceSpace.project_id == project_id)
        )
    ).all()
    return [
        ConfluenceSpaceOut(
            id=r.id,
            project_id=r.project_id,
            slug=r.slug,
            name=r.name,
            space_key=r.space_key,
            base_url=r.base_url,
        )
        for r in rows
    ]


async def add_repo(
    session: AsyncSession,
    project_id: UUID,
    url: str,
    *,
    slug: str | None = None,
    default_branch: str = "main",
) -> RepoOut:
    if not await session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    canonical = _normalize_repo_url(url)
    existing = (
        await session.exec(select(Repo).where(Repo.project_id == project_id))
    ).all()
    taken = {r.slug for r in existing}
    chosen_slug = _slugify(slug) if slug else _repo_slug_from_url(canonical, taken)
    if chosen_slug in taken:
        raise HTTPException(409, f"repo slug {chosen_slug!r} already exists in this project")
    repo = Repo(
        project_id=project_id,
        slug=chosen_slug,
        url=canonical,
        default_branch=default_branch,
    )
    session.add(repo)
    await session.commit()
    await session.refresh(repo)
    return RepoOut(
        id=repo.id,
        project_id=repo.project_id,
        slug=repo.slug,
        url=repo.url,
        default_branch=repo.default_branch,
    )


async def add_webex_room(
    session: AsyncSession,
    project_id: UUID,
    name: str,
    *,
    slug: str | None = None,
    webex_id: str | None = None,
) -> WebexRoomOut:
    if not await session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    chosen_slug = _slugify(slug or name)
    existing = (
        await session.exec(select(WebexRoom).where(WebexRoom.project_id == project_id))
    ).all()
    if chosen_slug in {r.slug for r in existing}:
        raise HTTPException(409, f"webex room slug {chosen_slug!r} already exists")
    room = WebexRoom(
        project_id=project_id, slug=chosen_slug, name=name, webex_id=webex_id
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return WebexRoomOut(
        id=room.id,
        project_id=room.project_id,
        slug=room.slug,
        name=room.name,
        webex_id=room.webex_id,
    )


async def add_confluence_space(
    session: AsyncSession,
    project_id: UUID,
    name: str,
    space_key: str,
    *,
    slug: str | None = None,
    base_url: str = "",
) -> ConfluenceSpaceOut:
    if not await session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    chosen_slug = _slugify(slug or space_key or name)
    existing = (
        await session.exec(
            select(ConfluenceSpace).where(ConfluenceSpace.project_id == project_id)
        )
    ).all()
    if chosen_slug in {r.slug for r in existing}:
        raise HTTPException(409, f"confluence space slug {chosen_slug!r} already exists")
    space = ConfluenceSpace(
        project_id=project_id,
        slug=chosen_slug,
        name=name,
        space_key=space_key,
        base_url=base_url,
    )
    session.add(space)
    await session.commit()
    await session.refresh(space)
    return ConfluenceSpaceOut(
        id=space.id,
        project_id=space.project_id,
        slug=space.slug,
        name=space.name,
        space_key=space.space_key,
        base_url=space.base_url,
    )


async def start_ingest(
    session: AsyncSession,
    project: Project,
    *,
    seed: str | None = None,
    connector_data: dict | None = None,
    app: Any | None = None,
) -> IngestRun:
    """Create an IngestRun row and schedule the pipeline as a background task.
    Raises HTTPException(409) if the project is already locked.

    `connector_data` is keyed by connector slug, e.g.:
      {"webex": {"meetings": [...]}, "confluence": {"pages": [...]}}

    `app` is the FastAPI application; passed to `dispatch_ingest` so the
    runner can look up the orchestrator singleton. None falls back to
    the in-process loop (covers tests + any caller outside a request).
    """
    if project.locked:
        raise HTTPException(409, "ingest already in progress")
    project_id = project.id
    run = IngestRun(
        project_id=project_id,
        status="pending",
        log=f"[seed] {seed}\n" if seed and seed.strip() else "",
    )
    project.locked = True
    session.add_all([run, project])
    await session.commit()
    await session.refresh(run)
    run_id = run.id
    asyncio.create_task(
        dispatch_ingest(
            project_id,
            run_id,
            seed=seed or None,
            connector_data=connector_data,
            app=app,
        )
    )
    return run


async def create_project_with_greenfield(
    session: AsyncSession,
    body: ProjectCreate,
    *,
    connector_data: dict | None = None,
    app: Any | None = None,
    creator_user_id: UUID | None = None,
) -> ProjectSummary:
    """Create the Project row, seed Repos from the body, and kick off a
    greenfield ingest. Sources for Webex / Confluence are added separately
    via `add_webex_room` / `add_confluence_space` since neither connector is
    wired yet."""
    project = Project(
        name=body.name,
        charter=body.charter,
        phase=body.phase,
        cadence=body.cadence,
        user_bindings=body.user_bindings,
        ingest_config=body.ingest_config,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    project_id = project.id
    if creator_user_id is not None:
        from ttt.models import ProjectMember
        session.add(ProjectMember(project_id=project_id, user_id=creator_user_id, role=settings.ttt_project_creator_role))
        await session.commit()
        await session.refresh(project)
    for url in body.repos:
        await add_repo(session, project_id, url)
    await start_ingest(session, project, connector_data=connector_data, app=app)
    await session.refresh(project)
    return await summarize(session, project)


async def reingest_project(
    session: AsyncSession,
    project_id: UUID,
    *,
    seed: str | None = None,
    connector_data: dict | None = None,
    app: Any | None = None,
) -> IngestRunRef:
    """Look up a project by id and kick off an incremental ingest.
    Raises HTTPException(404) if missing, (409) if already locked."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    run = await start_ingest(
        session, project, seed=seed, connector_data=connector_data, app=app
    )
    return IngestRunRef(run_id=run.id, project_id=project_id, status=run.status)


async def get_ingest_run_detail(session: AsyncSession, run_id: UUID) -> IngestRunDetail:
    """Fetch a single IngestRun by id with its full log buffer."""
    run = await session.get(IngestRun, run_id)
    if not run:
        raise HTTPException(404, "ingest run not found")
    return IngestRunDetail(
        run_id=run.id,
        project_id=run.project_id,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
        log=run.log or "",
    )


async def latest_ingest_run_for_project(
    session: AsyncSession, project_id: UUID
) -> IngestRunDetail:
    """Fetch the most recent IngestRun for a project."""
    if not await session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    run = (
        await session.exec(
            select(IngestRun)
            .where(IngestRun.project_id == project_id)
            .order_by(col(IngestRun.started_at).desc())
        )
    ).first()
    if not run:
        raise HTTPException(404, "no ingest runs for this project")
    return await get_ingest_run_detail(session, run.id)


async def cancel_project_ingest(session: AsyncSession, project_id: UUID) -> dict[str, str]:
    """Mark the latest pending/running IngestRun as failed and unlock the
    project. Use this to recover a project whose ingest process died (e.g.
    backend restart) and left the lock set."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if not project.locked:
        raise HTTPException(409, "no ingest in progress")
    run = (
        await session.exec(
            select(IngestRun)
            .where(IngestRun.project_id == project_id)
            .order_by(col(IngestRun.started_at).desc())
        )
    ).first()
    if run and run.status in ("pending", "running"):
        run.status = "failed"
        run.error = "cancelled by user"
        run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(run)
    project.locked = False
    session.add(project)
    await session.commit()
    return {"status": "cancelled"}
