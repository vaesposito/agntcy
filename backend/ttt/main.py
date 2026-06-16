import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel

from ttt.api import (
    chat,
    confluence_oauth,
    github_oauth,
    groups,
    internal,
    members,
    oauth,
    projects,
    reports,
    users,
    validate,
)
from ttt.api.mcp_server import mcp
from ttt.config import settings
from ttt.db import init_db
from ttt.orchestrator import build_orchestrator, set_orchestrator
from ttt.reports.repo import init_store

log = logging.getLogger("ttt.main")
logging.getLogger("ttt").setLevel(settings.log_level)


class HealthzResponse(BaseModel):
    status: Literal["ok"]
    started_at: datetime
    uptime_seconds: float


@dataclass
class _BackendState:
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ready: bool = False


_state = _BackendState()


async def _provision_dev_user() -> None:
    """Upsert the configured dev user with global-admin role on startup."""
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession

    from ttt.db import engine
    from ttt.models import User

    async with AsyncSession(engine, expire_on_commit=False) as session:
        sub = settings.ttt_dev_user_email
        existing = (await session.exec(select(User).where(User.sub == sub))).first()
        if not existing:
            session.add(
                User(
                    sub=sub,
                    email=sub,
                    name=settings.ttt_dev_user_name or sub,
                    roles=["admin"],
                )
            )
        elif "admin" not in (existing.roles or []):
            existing.roles = list(existing.roles or []) + ["admin"]
            session.add(existing)
        await session.commit()
    log.info("dev user provisioned: %s", settings.ttt_dev_user_email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_store()
    if not settings.caipe_proxy and settings.ttt_dev_user_email:
        await _provision_dev_user()
    orchestrator = build_orchestrator(settings.ttt_orchestrator)
    app.state.orchestrator = orchestrator
    set_orchestrator(orchestrator)
    log.info("agent orchestrator active: %s", settings.ttt_orchestrator)

    # Set a permissive umask so that created files are group- and world-writable 
    # by default. This is important for the session store directories and files, 
    # which need to be writable by both the backend process and the agent containers
    # which run as a different user.
    os.umask(0)

    async with mcp.session_manager.run():
        _state.ready = True
        try:
            yield
        finally:
            _state.ready = False
            running = await orchestrator.list_running()
            for status in running:
                try:
                    await orchestrator.stop(
                        status.project_id, role=status.role, grace_seconds=10
                    )
                except Exception:
                    log.exception(
                        "failed to stop agent for %s/%s on shutdown",
                        status.project_id, status.role,
                    )
            set_orchestrator(None)


app = FastAPI(title="Tiny Teams with Tokens", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.caipe_proxy:
    from ttt.auth import CaipeJWTMiddleware

    app.add_middleware(CaipeJWTMiddleware)
elif settings.ttt_dev_user_email:
    from ttt.auth import DevIdentityMiddleware

    app.add_middleware(DevIdentityMiddleware)

app.include_router(projects.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(members.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(internal.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(validate.router, prefix="/api")
app.include_router(oauth.router, prefix="/api")
app.include_router(oauth.global_router, prefix="/api")
app.include_router(confluence_oauth.router, prefix="/api")
app.include_router(confluence_oauth.global_router, prefix="/api")
app.include_router(github_oauth.router, prefix="/api")
app.include_router(github_oauth.global_router, prefix="/api")

@app.get("/healthz", response_model=HealthzResponse)
def healthz() -> HealthzResponse:
    uptime_s = (datetime.now(timezone.utc) - _state.started_at).total_seconds()
    return HealthzResponse(status="ok", started_at=_state.started_at, uptime_seconds=uptime_s)


@app.get("/readyz")
def readyz() -> Response:
    if _state.ready:
        return Response(status_code=200, content="ok")
    return Response(status_code=503, content="not ready")


@app.get("/metrics", response_class=PlainTextResponse)
def metrics() -> str:
    uptime_s = (datetime.now(timezone.utc) - _state.started_at).total_seconds()
    return (
        "# HELP ttt_backend_uptime_seconds Process uptime.\n"
        "# TYPE ttt_backend_uptime_seconds counter\n"
        f"ttt_backend_uptime_seconds {uptime_s:.3f}\n"
        "# HELP ttt_backend_ready Whether the backend passed startup (0/1).\n"
        "# TYPE ttt_backend_ready gauge\n"
        f"ttt_backend_ready {1 if _state.ready else 0}\n"
    )

app.mount("/mcp", mcp.streamable_http_app())
