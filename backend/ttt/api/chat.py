"""Chat endpoint — Server-Sent Events streaming chat events from the
per-project agent container, persisted to sqlite as ChatMessage rows.

Backend ↔ agent: `proxy_chat_sse` ensures an agent container is
running (orchestrator), opens a streaming POST to `/chat`, and yields
`ChatEventPayload`s back. The handler persists the assistant's final
state when the stream completes.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ttt.authz import assert_project_role, get_current_ctx, get_user_role
from ttt.config import settings
from ttt.db import engine, get_session
from ttt.models import ChatMessage, ChatSession, Project
from ttt.services import session_store
from ttt.services.agent_proxy import proxy_chat_sse

log = logging.getLogger("ttt.api.chat")

router = APIRouter(tags=["chat"])


class ChatTurnRequest(BaseModel):
    message: str


async def _get_or_create_session(session: AsyncSession, project_id: UUID) -> ChatSession:
    chat = (await session.exec(
        select(ChatSession).where(ChatSession.project_id == project_id)
    )).first()
    if chat:
        return chat
    chat = ChatSession(project_id=project_id)
    session.add(chat)
    await session.commit()
    await session.refresh(chat)
    return chat


@router.get("/projects/{project_id}/chat")
async def get_chat_state(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    await assert_project_role(project_id, "viewer", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    chat = await _get_or_create_session(session, project_id)
    return {
        "project_id": str(project_id),
        "session_id": str(chat.id),
        "sdk_session_id": chat.sdk_session_id,
        "created_at": chat.created_at.isoformat(),
        "last_used_at": chat.last_used_at.isoformat(),
    }


@router.post("/projects/{project_id}/chat/reset")
async def reset_chat(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    await assert_project_role(project_id, "editor", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    chat = await _get_or_create_session(session, project_id)
    chat.sdk_session_id = None
    chat.viewer_sdk_session_id = None
    chat.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(chat)

    msgs = (await session.exec(
        select(ChatMessage).where(ChatMessage.project_id == project_id)
    )).all()
    for m in msgs:
        await session.delete(m)
    await session.commit()

    # Wipe the durable transcript stores for both role containers.
    session_store.reset_all(project_id)
    return {"ok": True}


@router.get("/projects/{project_id}/chat/messages")
async def list_messages(
    project_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    await assert_project_role(project_id, "viewer", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    rows = (await session.exec(
        select(ChatMessage)
        .where(ChatMessage.project_id == project_id)
        .order_by(col(ChatMessage.created_at))
    )).all()
    return [
        {
            "id": str(r.id),
            "role": r.role,
            "text": r.text,
            "error": r.error,
            "tool_calls": r.tool_calls or [],
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/projects/{project_id}/chat")
async def post_chat_turn(
    project_id: UUID,
    body: ChatTurnRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> EventSourceResponse:
    await assert_project_role(project_id, "viewer", session)
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    chat = await _get_or_create_session(session, project_id)
    # _get_or_create_session commits when it creates a new ChatSession, which
    # expires all ORM objects in the session under expire_on_commit=True (the
    # default). Re-hydrate project so its attributes are readable inside the
    # SSE generator without triggering async lazy-loads.
    await session.refresh(project)
    chat_id = chat.id
    pid = project_id

    # Resolve the requesting user's effective role so we can route to the
    # correct container and use the matching session transcript.
    if not settings.caipe_proxy:
        effective_role = "editor"
    else:
        ctx = get_current_ctx()
        if ctx:
            effective_role = await get_user_role(
                project_id, ctx.sub, ctx.groups, session
            ) or "viewer"
        else:
            effective_role = "viewer"

    sdk_session_id = (
        chat.viewer_sdk_session_id
        if effective_role == "viewer"
        else chat.sdk_session_id
    )

    orch = getattr(request.app.state, "orchestrator", None)
    if orch is None:
        raise HTTPException(503, "agent orchestrator not configured")

    async def event_generator() -> AsyncIterator[dict[str, Any]]:
        captured_session_id: str | None = None
        assistant_text = ""
        assistant_error: str | None = None
        tool_calls: dict[str, dict] = {}

        stream = proxy_chat_sse(
            orch=orch,
            session=session,
            project=project,
            user_message=body.message,
            sdk_session_id=sdk_session_id,
            user_role=effective_role,
        )

        try:
            async for event in stream:
                if event.type == "session":
                    captured_session_id = event.data.get("session_id") or captured_session_id
                elif event.type == "token":
                    assistant_text += event.data.get("text", "")
                elif event.type == "tool_call":
                    tc_id = event.data.get("id") or ""
                    tool_calls[tc_id] = {
                        "id": tc_id,
                        "tool": event.data.get("tool"),
                        "input": event.data.get("input"),
                        "status": "running",
                    }
                elif event.type == "tool_result":
                    tc_id = event.data.get("id") or ""
                    if tc_id in tool_calls:
                        tool_calls[tc_id]["preview"] = event.data.get("preview")
                        tool_calls[tc_id]["truncated"] = event.data.get("truncated")
                        tool_calls[tc_id]["status"] = "done"
                elif event.type == "done":
                    captured_session_id = event.data.get("session_id") or captured_session_id
                    if not assistant_text.strip() and event.data.get("result"):
                        assistant_text = event.data["result"]
                elif event.type == "error":
                    assistant_error = event.data.get("message")
                yield {"event": event.type, "data": json.dumps(event.data)}
        finally:
            async with AsyncSession(engine, expire_on_commit=False) as ses:
                if captured_session_id:
                    fresh = await ses.get(ChatSession, chat_id)
                    if fresh:
                        if effective_role == "viewer":
                            fresh.viewer_sdk_session_id = captured_session_id
                        else:
                            fresh.sdk_session_id = captured_session_id
                        fresh.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
                        ses.add(fresh)
                ses.add(ChatMessage(project_id=pid, role="user", text=body.message))
                ses.add(
                    ChatMessage(
                        project_id=pid,
                        role="assistant",
                        text=assistant_text,
                        error=assistant_error,
                        tool_calls=list(tool_calls.values()),
                    )
                )
                await ses.commit()

    return EventSourceResponse(event_generator())
