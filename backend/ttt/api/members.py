"""Per-project member management — user and group role assignments."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.authz import assert_project_role
from ttt.db import get_session
from ttt.models import ProjectGroupRole, ProjectMember, User, UserGroup

router = APIRouter(tags=["members"])


# ── User members ──────────────────────────────────────────────────────────────


class UserMemberAdd(BaseModel):
    user_id: UUID
    role: str  # "viewer" | "editor" | "admin"


class UserMemberUpdate(BaseModel):
    role: str


@router.get("/projects/{project_id}/members/users")
async def list_user_members(
    project_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await assert_project_role(project_id, "viewer", session)
    rows = (
        await session.exec(
            select(ProjectMember).where(ProjectMember.project_id == project_id)
        )
    ).all()
    result = []
    for row in rows:
        user = await session.get(User, row.user_id)
        result.append({
            "user_id": str(row.user_id),
            "role": row.role,
            "email": user.email if user else None,
            "name": user.name if user else None,
            "created_at": row.created_at.isoformat(),
        })
    return result


@router.post("/projects/{project_id}/members/users", status_code=201)
async def add_user_member(
    project_id: UUID,
    body: UserMemberAdd,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await assert_project_role(project_id, "admin", session)
    if body.role not in ("viewer", "editor", "admin"):
        raise HTTPException(400, f"invalid role: {body.role!r}")
    if not await session.get(User, body.user_id):
        raise HTTPException(404, "user not found")
    existing = await session.get(ProjectMember, (project_id, body.user_id))
    if existing:
        raise HTTPException(409, "user already has a role on this project")
    session.add(ProjectMember(project_id=project_id, user_id=body.user_id, role=body.role))
    await session.commit()
    return {"project_id": str(project_id), "user_id": str(body.user_id), "role": body.role}


@router.put("/projects/{project_id}/members/users/{user_id}")
async def update_user_member(
    project_id: UUID,
    user_id: UUID,
    body: UserMemberUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await assert_project_role(project_id, "admin", session)
    if body.role not in ("viewer", "editor", "admin"):
        raise HTTPException(400, f"invalid role: {body.role!r}")
    row = await session.get(ProjectMember, (project_id, user_id))
    if not row:
        raise HTTPException(404, "member not found")
    row.role = body.role
    session.add(row)
    await session.commit()
    return {"project_id": str(project_id), "user_id": str(user_id), "role": body.role}


@router.delete("/projects/{project_id}/members/users/{user_id}", status_code=204)
async def remove_user_member(
    project_id: UUID,
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await assert_project_role(project_id, "admin", session)
    row = await session.get(ProjectMember, (project_id, user_id))
    if not row:
        raise HTTPException(404, "member not found")
    await session.delete(row)
    await session.commit()


# ── Group members ─────────────────────────────────────────────────────────────


class GroupRoleAdd(BaseModel):
    group_id: UUID
    role: str  # "viewer" | "editor" | "admin"


class GroupRoleUpdate(BaseModel):
    role: str


@router.get("/projects/{project_id}/members/groups")
async def list_group_members(
    project_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await assert_project_role(project_id, "viewer", session)
    rows = (
        await session.exec(
            select(ProjectGroupRole).where(ProjectGroupRole.project_id == project_id)
        )
    ).all()
    result = []
    for row in rows:
        grp = await session.get(UserGroup, row.group_id)
        result.append({
            "group_id": str(row.group_id),
            "role": row.role,
            "name": grp.name if grp else None,
            "kind": grp.kind if grp else None,
            "created_at": row.created_at.isoformat(),
        })
    return result


@router.post("/projects/{project_id}/members/groups", status_code=201)
async def add_group_member(
    project_id: UUID,
    body: GroupRoleAdd,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await assert_project_role(project_id, "admin", session)
    if body.role not in ("viewer", "editor", "admin"):
        raise HTTPException(400, f"invalid role: {body.role!r}")
    if not await session.get(UserGroup, body.group_id):
        raise HTTPException(404, "group not found")
    existing = await session.get(ProjectGroupRole, (project_id, body.group_id))
    if existing:
        raise HTTPException(409, "group already has a role on this project")
    session.add(ProjectGroupRole(project_id=project_id, group_id=body.group_id, role=body.role))
    await session.commit()
    return {"project_id": str(project_id), "group_id": str(body.group_id), "role": body.role}


@router.put("/projects/{project_id}/members/groups/{group_id}")
async def update_group_member(
    project_id: UUID,
    group_id: UUID,
    body: GroupRoleUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await assert_project_role(project_id, "admin", session)
    if body.role not in ("viewer", "editor", "admin"):
        raise HTTPException(400, f"invalid role: {body.role!r}")
    row = await session.get(ProjectGroupRole, (project_id, group_id))
    if not row:
        raise HTTPException(404, "group role not found")
    row.role = body.role
    session.add(row)
    await session.commit()
    return {"project_id": str(project_id), "group_id": str(group_id), "role": body.role}


@router.delete("/projects/{project_id}/members/groups/{group_id}", status_code=204)
async def remove_group_member(
    project_id: UUID,
    group_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await assert_project_role(project_id, "admin", session)
    row = await session.get(ProjectGroupRole, (project_id, group_id))
    if not row:
        raise HTTPException(404, "group role not found")
    await session.delete(row)
    await session.commit()
