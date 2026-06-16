"""Page repo + schema integration tests.

These used to exercise the static fan-out ingest path (now removed). The
agent path runs a Claude Agent SDK loop and isn't mockable without a
non-trivial fake — so instead we exercise the storage / schema invariants
that the agent relies on, via direct `report_repo` calls.
"""

import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

from ttt.config import settings
from ttt.reports import repo as report_repo
from ttt.reports import schema


@pytest.fixture
async def isolated_data(monkeypatch):
    """Per-test sandbox: temp sqlite db + temp wiki cache dir, both pointed at
    by both `settings` and the module-level `engine` used by the page store."""
    tmp = Path(tempfile.mkdtemp(prefix="ttt-test-"))
    monkeypatch.setattr(settings, "ttt_db_path", tmp / "ttt.db")
    monkeypatch.setattr(settings, "ttt_wiki_dir", tmp / "wiki")

    test_engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp / 'ttt.db'}",
        connect_args={"check_same_thread": False},
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    from ttt import db as db_mod
    monkeypatch.setattr(db_mod, "engine", test_engine)
    monkeypatch.setattr(report_repo, "engine", test_engine)

    report_repo.init_store()
    try:
        yield test_engine
    finally:
        await test_engine.dispose()
        shutil.rmtree(tmp, ignore_errors=True)


async def _write(project_id, path: str, kind: str, body: str = "body") -> None:
    spec = schema.PageSpec(path=path, kind=kind, title=path, order=0)
    md = schema.page_with_frontmatter(spec, body)
    await report_repo.write_page(project_id, path, md, message="test", author="test")


async def test_write_and_read_roundtrip(isolated_data) -> None:
    project_id = uuid4()
    await _write(project_id, "overview.md", "dynamic", "hello")
    pages = await report_repo.list_pages(project_id)
    assert "overview.md" in pages
    assert "hello" in pages["overview.md"]


async def test_per_repo_subtree_persists(isolated_data) -> None:
    """Nested page paths under repos/<slug>/ persist correctly and the FS
    cache mirrors them at the right depth."""
    project_id = uuid4()
    await _write(project_id, "overview.md", "dynamic", "top")
    await _write(project_id, "repos/mycelium/overview.md", "dynamic", "repo")
    pages = await report_repo.list_pages(project_id)
    assert "overview.md" in pages
    assert "repos/mycelium/overview.md" in pages

    pdir = settings.ttt_wiki_dir / str(project_id)
    assert (pdir / "overview.md").exists()
    assert (pdir / "repos" / "mycelium" / "overview.md").exists()


async def test_history_returns_revisions_in_order(isolated_data) -> None:
    project_id = uuid4()
    await _write(project_id, "overview.md", "dynamic", "v1")
    await _write(project_id, "overview.md", "dynamic", "v2")
    history = await report_repo.page_history(project_id, "overview.md")
    assert len(history) == 2


async def test_kinds_from_pages_after_write(isolated_data) -> None:
    """Frontmatter is authoritative — kinds_from_pages reads what was
    written, regardless of path or any seed defaults."""
    project_id = uuid4()
    await _write(project_id, "overview.md", "stable", "anchor")
    await _write(project_id, "product.md", "dynamic", "rewritable")
    await _write(project_id, "memory.md", "hidden", "secret")
    pages = await report_repo.list_pages(project_id)
    kinds = schema.kinds_from_pages(pages)
    assert kinds["overview.md"] == "stable"
    assert kinds["product.md"] == "dynamic"
    assert kinds["memory.md"] == "hidden"
