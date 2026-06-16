"""SSE proxy from backend ↔ ttt-agent.

Two helpers, one for chat and one for ingest. Both:

1. Ensure an agent container is running for the project (orchestrator).
2. Open a streaming POST to the agent's `/chat` / `/ingest`.
3. Yield bytes/events back to the caller — chat callers re-emit
   verbatim to the browser; ingest callers parse selected event types
   to populate `IngestRun.log` and finalize the `Report` row.

The proxy never blocks past the agent's response — agent failures
become an `error` event re-emitted so the browser sees them.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import httpx
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.models import Project
from ttt.orchestrator.base import AgentOrchestrator
from ttt.orchestrator.contract import (
    ChatEventPayload,
    ChatRequest,
    IngestEventPayload,
    IngestRequest,
)
from ttt.services import session_store
from ttt.services.agent_runtime import (
    build_secrets,
    build_snapshot,
    chat_stable_pages,
)

log = logging.getLogger("ttt.services.agent_proxy")


def _lifecycle(stage: str, message: str, **extra: Any) -> ChatEventPayload:
    """Construct a typed lifecycle event the chat UI renders as a
    collapsing strip atop the assistant bubble. `stage` is the machine
    key (used for ordering/dedup); `message` is the human-readable line
    shown in the UI."""
    return ChatEventPayload(
        type="lifecycle",
        data={"stage": stage, "message": message, **extra},
    )


async def _ensure_endpoint(
    orch: AgentOrchestrator, project_id: UUID, role: str = "editor"
):
    secrets = await build_secrets(project_id)
    return await orch.ensure_running(project_id, secrets=secrets, role=role)


# ---------- chat ----------


async def proxy_chat_sse(
    *,
    orch: AgentOrchestrator,
    session: AsyncSession,
    project: Project,
    user_message: str,
    sdk_session_id: str | None,
    user_role: str = "editor",
) -> AsyncIterator[ChatEventPayload]:
    """Proxy a chat turn: upstream SSE events come back as
    `ChatEventPayload`s the caller can fan out to its own SSE
    response. Lifecycle events surface orchestrator state (warm/cold
    container, agent ready, model streaming) so the UI doesn't show
    dead silence during the slow part. Errors surface as a synthesized
    `error` event."""
    t_start = time.monotonic()

    # Cold vs warm: peek at orchestrator state before ensure_running so
    # the lifecycle strip can show the right verb.
    pre = await orch.status(project.id, user_role)
    cold = pre.state != "running"

    yield _lifecycle(
        "dispatched",
        "starting agent…" if cold else "agent warm, dispatching…",
        cold_start=cold,
    )

    try:
        endpoint = await _ensure_endpoint(orch, project.id, user_role)
    except Exception as e:
        log.exception("ensure_running failed")
        yield ChatEventPayload(
            type="error",
            data={"message": f"agent failed to start: {type(e).__name__}: {e}"},
        )
        return

    ready_ms = int((time.monotonic() - t_start) * 1000)
    yield _lifecycle(
        "agent_ready",
        f"agent ready ({ready_ms / 1000:.1f}s)" if cold else "agent ready",
        duration_ms=ready_ms,
        cold_start=cold,
    )

    # A resume id pointing at a transcript the store no longer holds
    # (culled container, wiped store) makes the CLI exit 1 with "No
    # conversation found". Validate against the store and start fresh
    # instead of hard-failing.
    resume_id = sdk_session_id
    if resume_id and not session_store.pointer_is_valid(project.id, resume_id, user_role):
        log.info(
            "stale sdk_session_id %s for project %s — starting fresh",
            resume_id, project.id,
        )
        resume_id = None
        yield _lifecycle("fresh_session", "previous session expired, starting fresh")

    body = ChatRequest(
        message=user_message,
        sdk_session_id=resume_id,
        snapshot=await build_snapshot(session, project),
        stable_pages=await chat_stable_pages(project.id),
        role=user_role,
    )

    yield _lifecycle("connecting", "asking the agent…")

    first_byte_seen = False
    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream(
                "POST",
                f"{endpoint.url}/chat",
                json=body.model_dump(mode="json"),
            ) as resp:
                if resp.status_code >= 400:
                    text = (await resp.aread()).decode("utf-8", "replace")
                    yield ChatEventPayload(
                        type="error",
                        data={"message": f"agent /chat returned {resp.status_code}: {text[:400]}"},
                    )
                    return
                async for event in _parse_sse_chat(resp):
                    if not first_byte_seen:
                        first_byte_seen = True
                        ttfb_ms = int((time.monotonic() - t_start) * 1000)
                        yield _lifecycle(
                            "streaming",
                            "streaming response",
                            duration_ms=ttfb_ms,
                        )
                    yield event
        except httpx.HTTPError as e:
            log.exception("chat proxy failed")
            yield ChatEventPayload(
                type="error",
                data={"message": f"agent unreachable: {type(e).__name__}: {e}"},
            )


async def _parse_sse_chat(resp: httpx.Response) -> AsyncIterator[ChatEventPayload]:
    """Parse the `event: <type>\\ndata: <json>\\n\\n` shape we emit in
    `ttt.agent.main`. We re-build typed `ChatEventPayload`s on this side
    so the API layer doesn't pass through opaque bytes — easier to log
    and to translate downstream (e.g. the browser SSE format wants
    `event:` lines too, but the API can re-emit cleanly)."""
    current_event: str | None = None
    async for line in resp.aiter_lines():
        if line == "":
            current_event = None
            continue
        if line.startswith("event: "):
            current_event = line[len("event: "):].strip()
            continue
        if line.startswith("data: ") and current_event:
            data_raw = line[len("data: "):]
            try:
                data: dict[str, Any] = json.loads(data_raw)
            except json.JSONDecodeError:
                log.warning("malformed chat SSE data: %r", data_raw[:120])
                continue
            yield ChatEventPayload(type=current_event, data=data)  # type: ignore


# ---------- ingest ----------


async def proxy_ingest_sse(
    *,
    orch: AgentOrchestrator,
    session: AsyncSession,
    project: Project,
    run_id: UUID,
    seed: str | None,
    connector_data: dict[str, Any],
    is_greenfield: bool,
    report_id: UUID,
) -> AsyncIterator[IngestEventPayload]:
    """Proxy an ingest run from agent → caller. Caller is responsible
    for writing log lines into `IngestRun.log` and updating the
    `Report` row when the `done` event arrives — the proxy itself only
    forwards events."""
    endpoint = await _ensure_endpoint(orch, project.id)

    body = IngestRequest(
        run_id=run_id,
        seed=seed,
        connector_data=connector_data,
        snapshot=await build_snapshot(session, project),
        is_greenfield=is_greenfield,
        report_id=report_id,
    )

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream(
                "POST",
                f"{endpoint.url}/ingest",
                json=body.model_dump(mode="json"),
            ) as resp:
                if resp.status_code >= 400:
                    text = (await resp.aread()).decode("utf-8", "replace")
                    yield IngestEventPayload(
                        type="error",
                        data={"message": f"agent /ingest returned {resp.status_code}: {text[:400]}"},
                    )
                    return
                async for event in _parse_sse_ingest(resp):
                    yield event
        except httpx.HTTPError as e:
            log.exception("ingest proxy failed")
            yield IngestEventPayload(
                type="error",
                data={"message": f"agent unreachable: {type(e).__name__}: {e}"},
            )


async def _parse_sse_ingest(resp: httpx.Response) -> AsyncIterator[IngestEventPayload]:
    current_event: str | None = None
    async for line in resp.aiter_lines():
        if line == "":
            current_event = None
            continue
        if line.startswith("event: "):
            current_event = line[len("event: "):].strip()
            continue
        if line.startswith("data: ") and current_event:
            data_raw = line[len("data: "):]
            try:
                data: dict[str, Any] = json.loads(data_raw)
            except json.JSONDecodeError:
                log.warning("malformed ingest SSE data: %r", data_raw[:120])
                continue
            yield IngestEventPayload(type=current_event, data=data)  # type: ignore


__all__ = [
    "proxy_chat_sse",
    "proxy_ingest_sse",
]
