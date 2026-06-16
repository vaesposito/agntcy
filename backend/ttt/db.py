import asyncio
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel import SQLModel  # noqa: F401
from sqlmodel.ext.asyncio.session import AsyncSession

from ttt.config import settings

log = logging.getLogger("ttt.db")


def _make_engine() -> AsyncEngine:
    url = settings.ttt_database_url or f"sqlite+aiosqlite:///{settings.ttt_db_path}"
    kwargs: dict = {}
    if str(url).startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_async_engine(str(url), **kwargs)


engine = _make_engine()


def _alembic_config():
    from alembic.config import Config

    backend_dir = Path(__file__).parent.parent
    ini = backend_dir / "alembic.ini"
    cfg = Config(str(ini))
    # Resolve script_location absolutely so migrations run regardless of CWD.
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option(
        "sqlalchemy.url",
        str(settings.ttt_database_url or f"sqlite+aiosqlite:///{settings.ttt_db_path}"),
    )
    return cfg


async def _stamp_legacy_db() -> None:
    """Stamp databases that were created via SQLModel.metadata.create_all()
    before Alembic was introduced so that `upgrade head` doesn't try to
    re-create tables that already exist."""
    from sqlalchemy import inspect

    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda c: inspect(c).get_table_names())

    if "project" in tables and "alembic_version" not in tables:
        log.info("legacy database detected — stamping to alembic head")
        from alembic import command

        await asyncio.to_thread(command.stamp, _alembic_config(), "head")


async def init_db() -> None:
    if str(engine.url).startswith("sqlite"):
        settings.ttt_db_path.parent.mkdir(parents=True, exist_ok=True)

    await _stamp_legacy_db()

    from alembic import command

    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
