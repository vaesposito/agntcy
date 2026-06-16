"""Per-project chat-session store — a first-class durable data product.

The Claude Agent SDK persists each conversation transcript to disk under
`$HOME/.claude/projects/<cwd-slug>/<sdk_session_id>.jsonl` inside the agent
container. We mount a per-project host dir at `/home/agent/.claude` so that
transcript survives container restarts and chat `resume` keeps working when
the orchestrator cold-starts a fresh container.

This module owns that store's lifecycle, the way `reports/repo.py` owns the
wiki's. Note the inversion: the wiki is sqlite-authoritative with an FS
mirror; the session is **FS-authoritative** (the CLI owns the jsonl format)
and `ChatSession.sdk_session_id` in sqlite is just the pointer/index into it.

Lifecycle:
- `ensure`  — lazily create the store dir (orchestrator mkdirs + bind-mounts).
- `pointer_is_valid` — does a transcript exist for this sdk_session_id?
  The "reconcile" analog: validates the sqlite pointer against FS truth so a
  stale pointer degrades to a fresh session instead of a hard CLI failure.
- `reset`   — wipe transcripts for one role (used internally and by reset_all).
- `reset_all` — wipe transcripts for all roles (user "reset chat").
- `evict`   — remove the store (project deletion).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from uuid import UUID

from ttt.config import settings

log = logging.getLogger("ttt.services.session_store")

# Container mount point. The agent's HOME is /home/agent (Dockerfile.agent),
# so the CLI's state dir is /home/agent/.claude. Drivers bind-mount
# `session_dir(project_id, role)` here.
AGENT_CLAUDE_DIR = "/home/agent"


def session_dir(project_id: UUID, role: str = "editor") -> Path:
    return settings.ttt_sessions_dir / str(project_id) / role


def ensure(project_id: UUID, role: str = "editor") -> Path:
    """Create the store dir if absent. Returns it. Called by the orchestrator
    before bind-mounting so the host side always exists."""
    d = session_dir(project_id, role)
    d.mkdir(parents=True, exist_ok=True)
    for _p in (settings.ttt_sessions_dir, d.parent, d):
        if _p.exists():
            _p.chmod(0o777)
    return d


def pointer_is_valid(
    project_id: UUID, sdk_session_id: str | None, role: str = "editor"
) -> bool:
    """True iff a transcript file for `sdk_session_id` exists in the store.

    We glob `**/<id>.jsonl` rather than hardcoding the CLI's
    `projects/<cwd-slug>/` layout, so we're robust to it changing. A False
    here means the pointer is stale (culled container or wiped store) —
    callers drop it and start a fresh session."""
    if not sdk_session_id:
        return False
    d = session_dir(project_id, role)
    if not d.exists():
        return False
    return any(d.rglob(f"{sdk_session_id}.jsonl"))


def reset(project_id: UUID, role: str = "editor") -> None:
    """Wipe all transcripts for the project+role.
    The running agent container shares this bind-mounted dir, so the wipe is
    live; with the sqlite pointer also cleared by the caller, the next
    `query()` subprocess starts a fresh session."""
    d = session_dir(project_id, role)
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True, exist_ok=True)
    for _p in (settings.ttt_sessions_dir, d.parent, d):
        if _p.exists():
            _p.chmod(0o777)
    log.info("reset session store for project %s role %s at %s with permissions: %o", project_id, role, d, d.stat().st_mode)


def reset_all(project_id: UUID) -> None:
    """Wipe transcripts for all roles (user-initiated chat reset)."""
    for role in ("viewer", "editor"):
        reset(project_id, role)


def evict(project_id: UUID) -> None:
    """Remove the store entirely (project deletion). No-op if absent."""
    parent = settings.ttt_sessions_dir / str(project_id)
    if parent.exists():
        shutil.rmtree(parent)
        log.info("evicted session store for project %s", project_id)


__all__ = [
    "AGENT_CLAUDE_DIR",
    "ensure",
    "evict",
    "pointer_is_valid",
    "reset",
    "reset_all",
    "session_dir",
]
