"""Per-project RBAC — role resolution and FastAPI authorization helpers.

Roles (ordered by privilege): viewer < editor < admin

Resolution order for a user on a project:
1. Direct ProjectMember row (user_id FK)
2. External groups: UserGroup.kind='external' whose name appears in the JWT groups claim
3. Local groups: UserGroupMember rows for user_id → ProjectGroupRole

The highest role from any source wins.

Global bypass: users with 'admin' in User.roles skip all per-project checks.
When CAIPE_PROXY is False (local dev without JWT), all authz checks are skipped.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.auth import JwtUserContext, get_jwt_user_context
from ttt.config import settings

log = logging.getLogger("ttt.authz")

ROLE_RANK: dict[str, int] = {"viewer": 0, "editor": 1, "admin": 2}


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _resolve_user_id(user_sub: str, session: AsyncSession) -> UUID | None:
    from ttt.models import User
    user = (await session.exec(select(User).where(User.sub == user_sub))).first()
    return user.id if user else None


async def _is_global_admin(user_sub: str, session: AsyncSession) -> bool:
    from ttt.models import User
    user = (await session.exec(select(User).where(User.sub == user_sub))).first()
    return user is not None and "admin" in (user.roles or [])


def _higher(a: str | None, b: str | None) -> str | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if ROLE_RANK[a] >= ROLE_RANK[b] else b


# ── Public API ────────────────────────────────────────────────────────────────


async def get_user_role(
    project_id: UUID,
    user_sub: str,
    jwt_groups: list[str],
    session: AsyncSession,
) -> str | None:
    """Return the highest role the user holds on project_id, or None."""
    from ttt.models import ProjectGroupRole, ProjectMember, UserGroup, UserGroupMember

    user_id = await _resolve_user_id(user_sub, session)

    best: str | None = None

    # 1. Direct user membership
    if user_id is not None:
        pm = await session.get(ProjectMember, (project_id, user_id))
        if pm:
            best = _higher(best, pm.role)

    # 2. External group membership (name matches JWT claim)
    if jwt_groups:
        ext_groups = (
            await session.exec(
                select(UserGroup).where(
                    UserGroup.kind == "external",
                    col(UserGroup.name).in_(jwt_groups),
                )
            )
        ).all()
        for grp in ext_groups:
            pgr = await session.get(ProjectGroupRole, (project_id, grp.id))
            if pgr:
                best = _higher(best, pgr.role)

    # 3. Local group membership
    if user_id is not None:
        local_group_ids_rows = (
            await session.exec(
                select(UserGroupMember.group_id).where(
                    UserGroupMember.user_id == user_id
                )
            )
        ).all()
        for gid in local_group_ids_rows:
            pgr = await session.get(ProjectGroupRole, (project_id, gid))
            if pgr:
                best = _higher(best, pgr.role)

    return best


async def get_accessible_project_ids(
    user_sub: str,
    jwt_groups: list[str],
    session: AsyncSession,
) -> list[UUID] | None:
    """Return IDs of all projects the user has any role on, or None for all."""
    from ttt.models import ProjectGroupRole, ProjectMember, UserGroup, UserGroupMember

    if await _is_global_admin(user_sub, session):
        return None  # superadmin sees everything

    user_id = await _resolve_user_id(user_sub, session)
    project_ids: set[UUID] = set()

    # Direct membership
    if user_id is not None:
        rows = (
            await session.exec(
                select(ProjectMember.project_id).where(
                    ProjectMember.user_id == user_id
                )
            )
        ).all()
        project_ids.update(rows)

    # External groups
    if jwt_groups:
        ext_groups = (
            await session.exec(
                select(UserGroup).where(
                    UserGroup.kind == "external",
                    col(UserGroup.name).in_(jwt_groups),
                )
            )
        ).all()
        if ext_groups:
            ext_ids = [g.id for g in ext_groups]
            rows = (
                await session.exec(
                    select(ProjectGroupRole.project_id).where(
                        col(ProjectGroupRole.group_id).in_(ext_ids)
                    )
                )
            ).all()
            project_ids.update(rows)

    # Local groups
    if user_id is not None:
        local_gids = (
            await session.exec(
                select(UserGroupMember.group_id).where(
                    UserGroupMember.user_id == user_id
                )
            )
        ).all()
        if local_gids:
            rows = (
                await session.exec(
                    select(ProjectGroupRole.project_id).where(
                        col(ProjectGroupRole.group_id).in_(local_gids)
                    )
                )
            ).all()
            project_ids.update(rows)

    return list(project_ids)


async def assert_project_role(
    project_id: UUID,
    min_role: str,
    session: AsyncSession,
) -> None:
    """Raise HTTP 403 if the current user's role on project_id is below min_role.

    Skips all checks when CAIPE_PROXY is disabled (local dev without JWT).
    Global admins (User.roles contains 'admin') always pass.
    """
    if not settings.caipe_proxy:
        return

    ctx: JwtUserContext | None = get_jwt_user_context()
    if ctx is None:
        raise HTTPException(401, "not authenticated")

    if not ctx.sub:
        raise HTTPException(401, "JWT missing sub claim")

    if await _is_global_admin(ctx.sub, session):
        return

    role = await get_user_role(project_id, ctx.sub, ctx.groups, session)
    if role is None or ROLE_RANK.get(role, -1) < ROLE_RANK[min_role]:
        raise HTTPException(403, "insufficient project role")


def get_current_ctx() -> JwtUserContext | None:
    """Return the current request's JwtUserContext, or None if not set."""
    return get_jwt_user_context()
