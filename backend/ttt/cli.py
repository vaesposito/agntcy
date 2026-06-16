"""Tiny CLI for local dev tasks."""

import asyncio
import sys


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in {"-h", "--help"}:
        print(
            "usage: ttt <command>\n\ncommands:\n"
            "  init-data         run alembic migrations and init wiki cache dir\n"
            "  install-dev-user  add the configured dev user as admin on all projects"
        )
        return 0
    cmd = args[0]
    if cmd == "init-data":
        from ttt.db import init_db
        from ttt.reports.repo import init_store

        asyncio.run(init_db())
        init_store()
        print("initialized: applied migrations and created data/wiki/")
        return 0
    if cmd == "install-dev-user":
        asyncio.run(_install_dev_user())
        return 0
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 1


async def _install_dev_user() -> None:
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession

    from ttt.config import settings
    from ttt.db import engine, init_db
    from ttt.models import Project, ProjectMember, User

    if not settings.ttt_dev_user_email:
        print("TTT_DEV_USER_EMAIL is not configured")
        return

    await init_db()

    async with AsyncSession(engine, expire_on_commit=False) as session:
        sub = settings.ttt_dev_user_email
        user = (await session.exec(select(User).where(User.sub == sub))).first()
        if not user:
            print(
                f"Dev user {sub!r} not found; start the server first to provision it"
            )
            return

        projects = (await session.exec(select(Project))).all()
        added = 0
        for p in projects:
            if not await session.get(ProjectMember, (p.id, user.id)):
                session.add(ProjectMember(project_id=p.id, user_id=user.id, role="admin"))
                added += 1
        await session.commit()
        print(
            f"installed dev user on {added} project(s) "
            f"({len(projects) - added} already had access)"
        )


if __name__ == "__main__":
    raise SystemExit(main())
