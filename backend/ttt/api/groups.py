"""User group management — local and external groups."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.db import get_session
from ttt.models import User, UserGroup, UserGroupMember

router = APIRouter(tags=["groups"])


class GroupCreate(BaseModel):
    name: str
    kind: str  # "local" | "external"


@router.get("/groups")
async def list_groups(session: AsyncSession = Depends(get_session)) -> list[dict]:
    groups = (await session.exec(select(UserGroup))).all()
    return [
        {
            "id": str(g.id),
            "name": g.name,
            "kind": g.kind,
            "created_at": g.created_at.isoformat(),
        }
        for g in groups
    ]


@router.post("/groups", status_code=201)
async def create_group(
    body: GroupCreate,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.kind not in ("local", "external"):
        raise HTTPException(400, f"invalid kind: {body.kind!r}")
    grp = UserGroup(name=body.name, kind=body.kind)
    session.add(grp)
    await session.commit()
    await session.refresh(grp)
    return {"id": str(grp.id), "name": grp.name, "kind": grp.kind}


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    grp = await session.get(UserGroup, group_id)
    if not grp:
        raise HTTPException(404, "group not found")
    # Remove all memberships and project role assignments first
    from ttt.models import ProjectGroupRole
    for row in (
        await session.exec(select(UserGroupMember).where(UserGroupMember.group_id == group_id))
    ).all():
        await session.delete(row)
    for row in (
        await session.exec(
            select(ProjectGroupRole).where(ProjectGroupRole.group_id == group_id)
        )
    ).all():
        await session.delete(row)
    await session.delete(grp)
    await session.commit()


# ── Local group membership ────────────────────────────────────────────────────


class GroupMemberAdd(BaseModel):
    user_id: UUID


@router.get("/groups/{group_id}/members")
async def list_group_members(
    group_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    grp = await session.get(UserGroup, group_id)
    if not grp:
        raise HTTPException(404, "group not found")
    rows = (
        await session.exec(select(UserGroupMember).where(UserGroupMember.group_id == group_id))
    ).all()
    result = []
    for row in rows:
        user = await session.get(User, row.user_id)
        result.append({
            "user_id": str(row.user_id),
            "email": user.email if user else None,
            "name": user.name if user else None,
            "created_at": row.created_at.isoformat(),
        })
    return result


@router.post("/groups/{group_id}/members", status_code=201)
async def add_group_member(
    group_id: UUID,
    body: GroupMemberAdd,
    session: AsyncSession = Depends(get_session),
) -> dict:
    grp = await session.get(UserGroup, group_id)
    if not grp:
        raise HTTPException(404, "group not found")
    if grp.kind != "local":
        raise HTTPException(400, "members can only be added to local groups")
    if not await session.get(User, body.user_id):
        raise HTTPException(404, "user not found")
    existing = await session.get(UserGroupMember, (group_id, body.user_id))
    if existing:
        raise HTTPException(409, "user is already in this group")
    session.add(UserGroupMember(group_id=group_id, user_id=body.user_id))
    await session.commit()
    return {"group_id": str(group_id), "user_id": str(body.user_id)}


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
async def remove_group_member(
    group_id: UUID,
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(UserGroupMember, (group_id, user_id))
    if not row:
        raise HTTPException(404, "member not found")
    await session.delete(row)
    await session.commit()
