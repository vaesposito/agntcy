"""Ingest dispatch — backend entrypoint that proxies an ingest run to
the per-project agent container.

Pre-creates the `Report` row, opens an SSE stream to the agent's
`/ingest`, and persists each event as it arrives — log lines into
`IngestRun.log`, tool calls and page writes too. On the `done` event,
finalizes the `Report` and runs `report_repo.reconcile_from_disk` as a
safety net (the FS mount is shared between backend and agent).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import FastAPI
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.config import settings
from ttt.db import engine
from ttt.models import IngestRun, Project, Report
from ttt.orchestrator.base import AgentOrchestrator
from ttt.reports import repo as report_repo
from ttt.reports import schema as report_schema
from ttt.services.agent_proxy import proxy_ingest_sse

log = logging.getLogger("ttt.pipeline.runner")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


async def _append_log(session: AsyncSession, run: IngestRun, line: str) -> None:
    run.log = (run.log or "") + line + "\n"
    session.add(run)
    await session.commit()


def _summary_from_overview(pages: dict[str, str]) -> str:
    md = pages.get("overview.md", "")
    if not md:
        return ""
    _, body = report_schema.parse_frontmatter(md)
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("_("):
            continue
        return line[:200]
    return ""


async def dispatch_ingest(
    project_id: UUID,
    run_id: UUID,
    *,
    seed: str | None = None,
    connector_data: dict | None = None,
    app: FastAPI | None = None,
) -> None:
    """Background-task entrypoint. Loads the Project + IngestRun, proxies
    the run to the per-project agent container, and finalizes the
    Report. Exceptions are caught and logged so a background-task
    failure doesn't crash the event loop.

    `app` is the FastAPI application; required to resolve the
    orchestrator singleton."""
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            project = await session.get(Project, project_id)
            run = await session.get(IngestRun, run_id)
            if not project or not run:
                log.error(
                    "dispatch_ingest: missing project or run (%s, %s)",
                    project_id,
                    run_id,
                )
                return

            orch: AgentOrchestrator | None = (
                getattr(app.state, "orchestrator", None) if app is not None else None
            )
            if orch is None:
                run.status = "failed"
                run.error = "agent orchestrator not configured"
                run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
                project.locked = False
                session.add_all([run, project])
                await session.commit()
                log.error(
                    "dispatch_ingest: no orchestrator on app.state for run %s",
                    run_id,
                )
                return

            await _run_ingest_via_proxy(
                orch=orch,
                session=session,
                project=project,
                run=run,
                seed=seed,
                connector_data=connector_data or {},
            )
    except Exception:
        log.exception(
            "ingest pipeline failed for project=%s run=%s", project_id, run_id
        )


async def _run_ingest_via_proxy(
    *,
    orch: AgentOrchestrator,
    session: AsyncSession,
    project: Project,
    run: IngestRun,
    seed: str | None,
    connector_data: dict[str, Any],
) -> None:
    """Drive an ingest run by streaming events from the per-project
    agent container: create the `Report` row, append IngestRun log
    lines, reconcile the FS, and fill the summary."""
    project.locked = True
    run.status = "running"
    session.add_all([project, run])
    await session.commit()

    try:
        prior = (
            await session.exec(
                select(Report)
                .where(Report.project_id == project.id)
                .order_by(col(Report.version).desc())
            )
        ).first()
        is_greenfield = prior is None
        next_version = (prior.version + 1) if prior else 1

        report = Report(
            project_id=project.id,
            version=next_version,
            summary="",
            is_greenfield=is_greenfield,
        )
        session.add(report)
        await session.commit()
        await session.refresh(report)

        # Stable pages (charter/objectives/roadmap) are human-owned, so the
        # backend seeds them deterministically from their founding templates
        # rather than trusting the ingest agent to reproduce the exact section
        # contract (the cheap ingest model improvises its own structure). The
        # agent is told not to touch them; humans/chat fill them in place. The
        # write mirrors to the shared FS mount, so the agent still sees them.
        if is_greenfield:
            seeds = report_schema.stable_seed_templates()
            if seeds:
                await report_repo.write_pages(
                    project.id,
                    seeds,
                    message="seed stable pages (founding templates)",
                    author="ttt-pipeline",
                    report_id=report.id,
                )
                await _append_log(
                    session,
                    run,
                    f"[{_now()}] · seeded {len(seeds)} stable page(s): "
                    f"{', '.join(sorted(seeds))}",
                )

        await _append_log(
            session,
            run,
            f"[{_now()}] ▶ agent ingest dispatched to container "
            f"(mode={'greenfield' if is_greenfield else 'incremental'}, "
            f"orchestrator={settings.ttt_orchestrator})",
        )

        async for event in proxy_ingest_sse(
            orch=orch,
            session=session,
            project=project,
            run_id=run.id,
            seed=seed,
            connector_data=connector_data,
            is_greenfield=is_greenfield,
            report_id=report.id,
        ):
            await _append_log(session, run, _format_event(event))

        # FS → sqlite reconcile. Belt-and-braces: even though the agent's
        # persist hook calls `/internal/.../pages` for every Edit/Write,
        # this catches anything written via a path the hook missed.
        reconciled = await report_repo.reconcile_from_disk(
            project.id,
            author="ttt-pipeline",
            message="reconcile-from-disk",
            report_id=report.id,
        )
        if reconciled:
            await _append_log(
                session,
                run,
                f"[{_now()}] · reconciled {len(reconciled)} unpersisted file(s) "
                f"from disk: {', '.join(reconciled)}",
            )

        committed = await report_repo.list_pages(project.id)
        missing = report_schema.validate_pages(committed)
        if missing:
            log.warning(
                "v%d missing required pages after agent run: %s",
                next_version,
                missing,
            )

        report.summary = _summary_from_overview(committed)
        run.status = "success"
        run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add_all([report, run])
        await session.commit()

    except Exception as e:
        run.status = "failed"
        run.error = f"{type(e).__name__}: {e}"
        run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(run)
        await session.commit()
        raise
    finally:
        project.locked = False
        session.add(project)
        await session.commit()


def _format_event(event) -> str:
    """Render an `IngestEventPayload` as a single `IngestRun.log` line in
    the Docker-style format the frontend log viewer expects."""
    ts = event.data.get("ts", _now())
    if event.type == "log":
        return f"[{ts}] {event.data.get('line', '')}"
    if event.type == "tool_call":
        return f"[{ts}] → {event.data.get('tool', '?')} {event.data.get('input', '')}"
    if event.type == "tool_result":
        marker = "✗" if event.data.get("is_error") else "←"
        return f"[{ts}] {marker} {event.data.get('label', '?')} returned"
    if event.type == "page_written":
        return (
            f"[{ts}] ✎ wrote {event.data.get('path', '?')} "
            f"({event.data.get('bytes', 0)} bytes)"
        )
    if event.type == "done":
        cost = event.data.get("cost_usd")
        cost_str = f"${cost:.4f}" if isinstance(cost, (int, float)) else "?"
        return (
            f"[{ts}] ✓ agent finished "
            f"(subtype={event.data.get('subtype', '?')}, "
            f"turns={event.data.get('turns', '?')}, "
            f"tool_calls={event.data.get('tool_calls', '?')}, "
            f"cost={cost_str})"
        )
    if event.type == "error":
        return f"[{ts}] ✗ {event.data.get('message', '?')}"
    return f"[{ts}] {event.type}: {event.data}"
