"""Backend-side glue between the orchestrator and the agent.

Three responsibilities:

1. **Build `ProjectSnapshot`** from sqlite — the data the agent needs to
   construct system prompts. Called from the `/internal/.../snapshot`
   endpoint and also by the chat/ingest dispatch helpers when they POST
   to the agent.

2. **Build `AgentSecrets`** by resolving per-project tokens from sqlite +
   OAuth services. Injected as env at agent container start. The agent
   only sees pre-resolved values; never reaches into sqlite for tokens.

3. **Look up stable pages** for the chat prompt. The agent's `/chat`
   request body includes the stable-page snapshot rather than fetching
   over a separate round trip.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.config import settings
from ttt.models import ConfluenceSpace, Project, Repo, WebexRoom
from ttt.orchestrator.base import AgentSecrets
from ttt.orchestrator.contract import (
    ConfluenceSpaceSnapshot,
    ProjectSnapshot,
    RepoSnapshot,
    WebexRoomSnapshot,
)
from ttt.reports import repo as report_repo

log = logging.getLogger("ttt.services.agent_runtime")

# Pages the chat agent always reads to anchor its responses.
CHAT_STABLE_PAGES = (
    "overview.md",
    "team.md",
    "glossary.md",
    "architecture.md",
)


async def build_snapshot(session: AsyncSession, project: Project) -> ProjectSnapshot:
    """Resolve a project + its sources into a `ProjectSnapshot` the agent
    can use to build prompts. Called every time the backend dispatches a
    chat or ingest run — small enough to not warrant caching."""
    repos = list(
        (await session.exec(select(Repo).where(Repo.project_id == project.id))).all()
    )
    rooms = list(
        (await session.exec(select(WebexRoom).where(WebexRoom.project_id == project.id))).all()
    )
    spaces = list(
        (
            await session.exec(
                select(ConfluenceSpace).where(ConfluenceSpace.project_id == project.id)
            )
        ).all()
    )
    return ProjectSnapshot(
        project_id=project.id,
        name=project.name,
        charter=project.charter or "",
        phase=project.phase,
        cadence=project.cadence,
        repos=[
            RepoSnapshot(slug=r.slug, url=r.url, default_branch=r.default_branch)
            for r in repos
        ],
        webex_rooms=[
            WebexRoomSnapshot(slug=r.slug, name=r.name, webex_id=r.webex_id)
            for r in rooms
        ],
        confluence_spaces=[
            ConfluenceSpaceSnapshot(
                slug=s.slug,
                name=s.name,
                space_key=s.space_key,
                base_url=s.base_url,
            )
            for s in spaces
        ],
    )


async def build_secrets(project_id: UUID) -> AgentSecrets:
    """Resolve per-project tokens from OAuth services + .env fallback.

    Lazy import keeps `ttt.services.*_oauth` out of the agent image's
    transitive deps when this module is imported there (it shouldn't be,
    but belt-and-braces)."""
    from ttt.services.confluence_oauth import (
        resolve_confluence_cloud_id,
        resolve_confluence_token,
    )
    from ttt.services.github_oauth import resolve_github_token
    from ttt.services.webex_oauth import resolve_webex_token

    return AgentSecrets(
        anthropic_api_key=settings.anthropic_api_key,
        anthropic_auth_token=settings.anthropic_auth_token,
        anthropic_base_url=settings.anthropic_base_url,
        github_token=await resolve_github_token(project_id) or settings.github_token,
        confluence_token=await resolve_confluence_token(project_id) or settings.confluence_token,
        confluence_cloud_id=await resolve_confluence_cloud_id(project_id) or "",
        confluence_base_url=settings.confluence_base_url,
        confluence_user=settings.confluence_user,
        webex_token=await resolve_webex_token(project_id) or settings.webex_token,
    )


async def fetch_stable_pages(project_id: UUID, paths: list[str]) -> dict[str, str]:
    """Read named stable pages from sqlite. Missing pages return an empty
    string so the agent's prompt builder can fall back gracefully."""
    out: dict[str, str] = {}
    for path in paths:
        try:
            out[path] = await report_repo.read_page(project_id, path)
        except LookupError:
            out[path] = ""
    return out


async def chat_stable_pages(project_id: UUID) -> dict[str, str]:
    """Convenience: stable pages the chat agent always wants."""
    return await fetch_stable_pages(project_id, list(CHAT_STABLE_PAGES))


__all__ = [
    "CHAT_STABLE_PAGES",
    "build_secrets",
    "build_snapshot",
    "chat_stable_pages",
    "fetch_stable_pages",
]
