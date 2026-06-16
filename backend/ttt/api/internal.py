"""Internal API surface — callbacks the per-project ttt-agent containers
make back to the backend. Not exposed to the browser; routed only on
the docker network and authenticated by the per-agent bearer token the
orchestrator generated when it spun the container up.

Endpoints:

- `GET  /api/internal/projects/{id}/snapshot` — `ProjectSnapshot` for
  the agent's prompt builder.
- `POST /api/internal/projects/{id}/stable-pages` — body
  `{paths: list[str]}`; returns `{path: markdown}`.
- `POST /api/internal/projects/{id}/pages` — body `WritePageRequest`;
  the agent's persist hook calls this on Edit/Write. Routes through
  `report_repo.write_page` so sqlite + FS-cache stay consistent.
- `POST /api/internal/projects/{id}/runs/{run_id}/log` — body
  `AppendLogRequest`. Optional callback path; today the SSE proxy
  populates `IngestRun.log` from the `log`/`tool_call`/`page_written`
  events as they stream past, so this endpoint is rarely hit.

Auth: every request must carry `Authorization: Bearer <token>` where
`<token>` matches the per-agent token the orchestrator issued for this
project. Mismatches return 401.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.db import get_session
from ttt.models import IngestRun, Project
from ttt.orchestrator.base import AgentOrchestrator
from ttt.orchestrator.contract import (
    AppendLogRequest,
    ProjectSnapshot,
    WritePageRequest,
)
from ttt.reports import repo as report_repo
from ttt.services.agent_runtime import build_snapshot, fetch_stable_pages

log = logging.getLogger("ttt.api.internal")

router = APIRouter(tags=["internal"], prefix="/internal")


def _get_orchestrator(request: Request) -> AgentOrchestrator:
    orch = getattr(request.app.state, "orchestrator", None)
    if orch is None:
        raise HTTPException(503, "orchestrator not configured")
    return orch


def _verify_agent(
    project_id: UUID,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Auth dependency: bearer token must match the orchestrator's
    in-memory entry for this project. The header arrives as
    `Bearer <token>`; we split on the first space."""
    orch = _get_orchestrator(request)
    expected = orch.get_bearer_token(project_id)
    if not expected:
        log.warning("no bearer token registered for project %s", project_id)
        raise HTTPException(401, "agent not registered")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    presented = authorization.split(" ", 1)[1].strip()
    if presented != expected:
        raise HTTPException(401, "invalid bearer token")


# ---------- snapshot ----------


@router.get("/projects/{project_id}/snapshot", response_model=ProjectSnapshot)
async def get_snapshot(
    project_id: UUID,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
) -> ProjectSnapshot:
    _verify_agent(project_id, request, authorization)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return await build_snapshot(session, project)


# ---------- stable-pages ----------


class StablePagesRequest(BaseModel):
    paths: list[str]


@router.post("/projects/{project_id}/stable-pages")
async def post_stable_pages(
    project_id: UUID,
    body: StablePagesRequest,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    _verify_agent(project_id, request, authorization)
    return await fetch_stable_pages(project_id, body.paths)


# ---------- page persist ----------


@router.post("/projects/{project_id}/pages")
async def post_page(
    project_id: UUID,
    body: WritePageRequest,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    _verify_agent(project_id, request, authorization)
    try:
        await report_repo.write_page(
            project_id,
            body.path,
            body.body,
            message=body.message,
            author=body.author,
            report_id=body.report_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"status": "ok"}


# ---------- ingest log append ----------


@router.post("/projects/{project_id}/runs/{run_id}/log")
async def post_log(
    project_id: UUID,
    run_id: UUID,
    body: AppendLogRequest,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    _verify_agent(project_id, request, authorization)
    run = await session.get(IngestRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(404, "ingest run not found")
    run.log = (run.log or "") + body.line + "\n"
    session.add(run)
    await session.commit()
    return {"status": "ok"}


# Silence unused-import warnings for re-exports kept for future endpoints.
_ = (select,)
