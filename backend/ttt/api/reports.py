from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.authz import assert_project_role
from ttt.db import get_session
from ttt.models import PageRevision, Project, Report
from ttt.reports import repo as report_repo
from ttt.reports import schema as report_schema

router = APIRouter(tags=["reports"])


class PageWrite(BaseModel):
    markdown: str
    author: str = "ttt-web"
    message: str | None = None


class PageCreate(BaseModel):
    path: str  # must end in .md
    title: str
    parent_path: str | None = None  # for hierarchical placement
    kind: str = "stable"  # stable | dynamic | hidden
    author: str = "ttt-web"


class FrontmatterPatch(BaseModel):
    kind: str | None = None
    title: str | None = None
    order: int | None = None
    author: str = "ttt-web"


def _tree_to_dict(nodes: list[report_schema.PageNode]) -> list[dict[str, Any]]:
    return [
        {
            "path": n.path,
            "title": n.title,
            "kind": n.kind,
            "order": n.order,
            "children": _tree_to_dict(n.children),
        }
        for n in nodes
    ]


@router.get("/projects/{project_id}/reports")
async def list_reports(project_id: UUID, session: AsyncSession = Depends(get_session)) -> list[Report]:
    await assert_project_role(project_id, "viewer", session)
    return list(
        (await session.exec(
            select(Report)
            .where(Report.project_id == project_id)
            .order_by(col(Report.version).desc())
        )).all()
    )


@router.get("/projects/{project_id}/reports/{version}")
async def get_report(
    project_id: UUID, version: int, session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    await assert_project_role(project_id, "viewer", session)
    """Return the report's metadata + page tree built from the current page state.
    Pre-#1, viewing an older version still shows the latest content; the version
    number is metadata for reingest semantics, not snapshot retrieval."""
    report = (await session.exec(
        select(Report).where(Report.project_id == project_id, Report.version == version)
    )).first()
    if not report:
        raise HTTPException(404, "report not found")
    pages = await report_repo.list_pages(project_id)
    tree = report_schema.build_tree(pages)
    return {
        **report.model_dump(),
        "page_tree": _tree_to_dict(tree),
    }


@router.get("/projects/{project_id}/reports/{version}/pages/{page_path:path}")
async def get_page(
    project_id: UUID,
    version: int,
    page_path: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await assert_project_role(project_id, "viewer", session)
    report = (await session.exec(
        select(Report).where(Report.project_id == project_id, Report.version == version)
    )).first()
    if not report:
        raise HTTPException(404, "report not found")
    try:
        markdown = await report_repo.read_page(project_id, page_path)
    except LookupError:
        raise HTTPException(404, f"page not found: {page_path}")
    fm, body = report_schema.parse_frontmatter(markdown)
    history = await report_repo.page_history(project_id, page_path)
    latest = history[0] if history else None
    return {
        "path": page_path,
        "markdown": markdown,
        "frontmatter": fm,
        "body": body,
        "revision_id": str(latest.id) if latest else None,
        "updated_at": latest.created_at.isoformat() if latest else None,
        "author": latest.author if latest else None,
    }


@router.put("/projects/{project_id}/reports/{version}/pages/{page_path:path}")
async def put_page(
    project_id: UUID,
    version: int,
    page_path: str,
    body: PageWrite,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await assert_project_role(project_id, "editor", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")

    report = (await session.exec(
        select(Report).where(Report.project_id == project_id, Report.version == version)
    )).first()
    if not report:
        raise HTTPException(404, "report not found")

    msg = body.message or f"edit {page_path} on v{version} by {body.author}"
    await report_repo.write_page(
        project_id,
        page_path,
        body.markdown,
        message=msg,
        author=body.author,
    )
    return {"path": page_path}


@router.get("/projects/{project_id}/pages/{page_path:path}/history")
async def page_history(
    project_id: UUID,
    page_path: str,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await assert_project_role(project_id, "viewer", session)
    """List every revision of a page, newest first. Body content omitted —
    fetch via /revisions/{id} when the user opens a diff."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    revs = await report_repo.page_history(project_id, page_path)
    return [
        {
            "id": str(r.id),
            "created_at": r.created_at.isoformat(),
            "author": r.author,
            "message": r.message,
            "report_id": str(r.report_id) if r.report_id else None,
        }
        for r in revs
    ]


@router.get("/projects/{project_id}/revisions/{revision_id}")
async def get_revision(
    project_id: UUID,
    revision_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await assert_project_role(project_id, "viewer", session)
    rev = await session.get(PageRevision, revision_id)
    if not rev or rev.project_id != project_id:
        raise HTTPException(404, "revision not found")
    fm, body = report_schema.parse_frontmatter(rev.markdown)
    return {
        "id": str(rev.id),
        "path": rev.path,
        "markdown": rev.markdown,
        "body": body,
        "frontmatter": fm,
        "author": rev.author,
        "message": rev.message,
        "created_at": rev.created_at.isoformat(),
    }


@router.post("/projects/{project_id}/reports/{version}/pages")
async def create_page(
    project_id: UUID,
    version: int,
    body: PageCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new (stable) page in the wiki. Used by the +new-page UI."""
    await assert_project_role(project_id, "editor", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")
    report = (await session.exec(
        select(Report).where(Report.project_id == project_id, Report.version == version)
    )).first()
    if not report:
        raise HTTPException(404, "report not found")

    final_path = body.path
    if body.parent_path:
        parent_dir = body.parent_path.removesuffix(".md")
        if not final_path.startswith(parent_dir + "/"):
            final_path = f"{parent_dir}/{body.path.lstrip('/')}"
    if not final_path.endswith(".md"):
        final_path = final_path + ".md"

    existing = await report_repo.list_pages(project_id)
    if final_path in existing:
        raise HTTPException(409, f"page already exists: {final_path}")

    kind = body.kind.lower()
    if kind not in ("stable", "dynamic", "hidden", "report"):
        raise HTTPException(400, f"invalid kind: {body.kind!r}")

    fm: dict[str, object] = {"title": body.title, "kind": kind, "order": 999}
    initial = report_schema.serialize_frontmatter(
        fm,
        f"# {body.title}\n\n{report_schema.EMPTY_PAGE_PLACEHOLDER}\n",
    )
    await report_repo.write_page(
        project_id,
        final_path,
        initial,
        message=f"create page {final_path} by {body.author}",
        author=body.author,
    )
    return {"path": final_path, "title": body.title, "kind": kind}


@router.delete("/projects/{project_id}/reports/{version}/pages/{page_path:path}")
async def delete_page(
    project_id: UUID,
    version: int,
    page_path: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Soft-delete a page via tombstone PageRevision. History remains intact."""
    await assert_project_role(project_id, "editor", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")
    report = (await session.exec(
        select(Report).where(Report.project_id == project_id, Report.version == version)
    )).first()
    if not report:
        raise HTTPException(404, "report not found")
    try:
        await report_repo.read_page(project_id, page_path)  # raises if already deleted/missing
    except LookupError:
        raise HTTPException(404, f"page not found: {page_path}")
    await report_repo.delete_page(project_id, page_path, author="ttt-web")
    return {"deleted": True, "path": page_path}


@router.patch("/projects/{project_id}/reports/{version}/pages/{page_path:path}/frontmatter")
async def patch_frontmatter(
    project_id: UUID,
    version: int,
    page_path: str,
    body: FrontmatterPatch,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update specific frontmatter fields without touching the body. Used by
    the kind toggle in the page header — the body would be unsafe to round-trip
    through Crepe just to change a metadata line."""
    await assert_project_role(project_id, "editor", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    if project.locked:
        raise HTTPException(409, "project is locked while ingest is running")

    if body.kind is not None and body.kind.lower() not in (
        "stable",
        "dynamic",
        "hidden",
        "report",
    ):
        raise HTTPException(400, f"invalid kind: {body.kind!r}")

    try:
        existing_md = await report_repo.read_page(project_id, page_path)
    except LookupError:
        raise HTTPException(404, f"page not found: {page_path}")

    fm, page_body = report_schema.parse_frontmatter(existing_md)
    if body.kind is not None:
        fm["kind"] = body.kind.lower()
    if body.title is not None:
        fm["title"] = body.title
    if body.order is not None:
        fm["order"] = body.order

    new_md = report_schema.serialize_frontmatter(fm, page_body)
    await report_repo.write_page(
        project_id,
        page_path,
        new_md,
        message=f"update frontmatter on {page_path} by {body.author}",
        author=body.author,
    )
    return {"path": page_path, "frontmatter": fm}
