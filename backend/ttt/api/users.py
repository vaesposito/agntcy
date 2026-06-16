"""User search and creation endpoints — used by the project creation wizard."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.db import get_session
from ttt.models import User

router = APIRouter(tags=["users"])


class UserCreate(BaseModel):
    email: str
    name: str | None = None


@router.get("/users")
async def search_users(
    q: str = Query(default="", min_length=0),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    q = q.strip()
    if not q:
        return []
    pattern = f"%{q.lower()}%"
    rows = (
        await session.exec(
            select(User)
            .where(
                or_(
                    col(User.email).ilike(pattern),
                    col(User.name).ilike(pattern),
                )
            )
            .limit(20)
        )
    ).all()
    return [
        {"id": str(u.id), "email": u.email, "name": u.name}
        for u in rows
    ]


@router.post("/users")
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
) -> dict:
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="email is required")
    existing = (await session.exec(select(User).where(User.email == email))).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")
    user = User(sub=email, email=email, name=body.name)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return {"id": str(user.id), "email": user.email, "name": user.name}
