"""Live validation endpoints used by the onboarding flow.

Hits the GitHub API with our configured token to confirm a repo exists and
returns lightweight metadata the UI can show the user before they commit.
"""

from __future__ import annotations

import asyncio
import base64
import time
from collections import deque
from typing import Any

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from ttt.config import settings

router = APIRouter()

GH = "https://api.github.com"

LOOKAHEAD_MAX_PER_MIN = 5
LOOKAHEAD_WINDOW_S = 60.0
USER_REPOS_TTL_S = 300.0
SEARCH_TTL_S = 90.0

_lock = asyncio.Lock()
_search_hits: deque[float] = deque()
_user_repos_cache: tuple[float, list[dict[str, Any]]] | None = None
_search_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


async def _take_search_token() -> bool:
    """Consume one slot from the GitHub-search token bucket; False if exhausted."""
    now = time.monotonic()
    async with _lock:
        while _search_hits and now - _search_hits[0] > LOOKAHEAD_WINDOW_S:
            _search_hits.popleft()
        if len(_search_hits) >= LOOKAHEAD_MAX_PER_MIN:
            return False
        _search_hits.append(now)
        return True


def _canonical(url: str) -> str | None:
    s = url.strip().rstrip("/")
    if s.startswith("https://github.com/"):
        s = s[len("https://github.com/") :]
    elif s.startswith("github.com/"):
        s = s[len("github.com/") :]
    if s.endswith(".git"):
        s = s[: -len(".git")]
    parts = s.split("/")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return None
    return f"{parts[0]}/{parts[1]}"


def _resolve_token(session_key: str | None = None) -> str:
    """Resolve a GitHub token: temp session token > .env PAT."""
    if session_key:
        from ttt.services.github_oauth import get_temp_token

        entry = get_temp_token(session_key)
        if entry:
            return entry["access_token"]
    return settings.github_token


def _headers(token: str | None = None) -> dict[str, str]:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ttt-onboarding",
    }
    t = token or settings.github_token
    if t:
        h["Authorization"] = f"Bearer {t}"
    return h


class RepoCommitter(BaseModel):
    login: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    commits: int = 0


class RepoMeta(BaseModel):
    full_name: str
    html_url: str
    description: str | None = None
    private: bool = False
    default_branch: str | None = None
    stargazers_count: int = 0
    pushed_at: str | None = None
    language: str | None = None
    committers: list[RepoCommitter] = []
    ttt_wiki: str | None = None


class ValidateRepoRequest(BaseModel):
    url: str


class ValidateRepoResponse(BaseModel):
    ok: bool
    repo: RepoMeta | None = None
    error: str | None = None


@router.post("/validate/github-repo", response_model=ValidateRepoResponse)
async def validate_github_repo(req: ValidateRepoRequest, session_key: str | None = Query(None)) -> ValidateRepoResponse:
    canonical = _canonical(req.url)
    if not canonical:
        return ValidateRepoResponse(ok=False, error="Enter a repo as `owner/name` or a full github.com URL.")

    token = _resolve_token(session_key)
    async with httpx.AsyncClient(timeout=15.0, headers=_headers(token)) as client:
        r = await client.get(f"{GH}/repos/{canonical}")
        if r.status_code == 404:
            if not token:
                return ValidateRepoResponse(ok=False, error=f"{canonical} not found. For private repos, connect GitHub first.")
            return ValidateRepoResponse(ok=False, error=f"{canonical} not found or not accessible. If this is a private org repo, your GitHub token may lack org access.")
        if r.status_code == 401:
            return ValidateRepoResponse(ok=False, error="GitHub auth failed. Reconnect GitHub.")
        if r.status_code >= 400:
            return ValidateRepoResponse(ok=False, error=f"GitHub error {r.status_code}: {r.text[:200]}")
        data = r.json()

        commits_resp = await client.get(f"{GH}/repos/{canonical}/commits", params={"per_page": 20})
        committers: list[RepoCommitter] = []
        if commits_resp.status_code == 200:
            tally: dict[str, RepoCommitter] = {}
            for c in commits_resp.json():
                author = c.get("author") or {}
                commit_author = (c.get("commit") or {}).get("author") or {}
                login = author.get("login")
                name = commit_author.get("name")
                key = login or name or "unknown"
                if key in tally:
                    tally[key].commits += 1
                else:
                    tally[key] = RepoCommitter(
                        login=login,
                        name=name,
                        avatar_url=author.get("avatar_url"),
                        commits=1,
                    )
            committers = sorted(tally.values(), key=lambda c: c.commits, reverse=True)[:6]

        ttt_wiki: str | None = None
        wiki_resp = await client.get(f"{GH}/repos/{canonical}/contents/.ttt/wiki.md")
        if wiki_resp.status_code == 200:
            payload = wiki_resp.json()
            if isinstance(payload, dict) and payload.get("encoding") == "base64":
                try:
                    raw = base64.b64decode(payload.get("content", "")).decode("utf-8", errors="replace")
                    ttt_wiki = raw[:4000]
                except Exception:
                    ttt_wiki = None

    return ValidateRepoResponse(
        ok=True,
        repo=RepoMeta(
            full_name=data.get("full_name", canonical),
            html_url=data.get("html_url", f"https://github.com/{canonical}"),
            description=data.get("description"),
            private=bool(data.get("private")),
            default_branch=data.get("default_branch"),
            stargazers_count=int(data.get("stargazers_count") or 0),
            pushed_at=data.get("pushed_at"),
            language=data.get("language"),
            committers=committers,
            ttt_wiki=ttt_wiki,
        ),
    )


class RepoSuggestion(BaseModel):
    full_name: str
    description: str | None = None
    private: bool = False
    stargazers_count: int = 0
    language: str | None = None
    source: str  # "accessible" | "org" | "search"


class LookaheadResponse(BaseModel):
    suggestions: list[RepoSuggestion] = []
    searched: bool = False
    rate_limited: bool = False
    message: str | None = None


async def _load_user_repos(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    global _user_repos_cache
    now = time.monotonic()
    if _user_repos_cache and now - _user_repos_cache[0] < USER_REPOS_TTL_S:
        return _user_repos_cache[1]
    repos: list[dict[str, Any]] = []
    for page in (1, 2):
        r = await client.get(
            f"{GH}/user/repos",
            params={"per_page": 100, "page": page, "sort": "pushed", "affiliation": "owner,collaborator,organization_member"},
        )
        if r.status_code != 200:
            break
        chunk = r.json()
        if not isinstance(chunk, list) or not chunk:
            break
        repos.extend(chunk)
        if len(chunk) < 100:
            break
    _user_repos_cache = (now, repos)
    return repos


def _to_sugg(item: dict[str, Any], source: str) -> RepoSuggestion:
    return RepoSuggestion(
        full_name=item.get("full_name") or "",
        description=item.get("description"),
        private=bool(item.get("private")),
        stargazers_count=int(item.get("stargazers_count") or 0),
        language=item.get("language"),
        source=source,
    )


async def _list_owner_repos(client: httpx.AsyncClient, owner: str) -> list[dict[str, Any]]:
    """List repos for a user or org. Cached alongside the search cache."""
    cache_key = f"owner:{owner.lower()}"
    cached = _search_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < SEARCH_TTL_S:
        return cached[1]
    for path in (f"{GH}/users/{owner}/repos", f"{GH}/orgs/{owner}/repos"):
        r = await client.get(path, params={"per_page": 50, "sort": "pushed"})
        if r.status_code == 200:
            items = r.json() or []
            if isinstance(items, list) and items:
                _search_cache[cache_key] = (time.monotonic(), items)
                return items
        if r.status_code in (401, 403):
            break
    _search_cache[cache_key] = (time.monotonic(), [])
    return []


@router.get("/lookahead/github-repos", response_model=LookaheadResponse)
async def lookahead_github_repos(q: str = Query("", min_length=0, max_length=200), session_key: str | None = Query(None)) -> LookaheadResponse:
    needle = q.strip().lower()
    if len(needle) < 2:
        return LookaheadResponse(suggestions=[], searched=False)

    owner, _, partial = needle.partition("/")
    token = _resolve_token(session_key)

    async with httpx.AsyncClient(timeout=10.0, headers=_headers(token)) as client:
        owned = await _load_user_repos(client)
        local = [r for r in owned if needle in (r.get("full_name") or "").lower()][:8]
        suggestions = [_to_sugg(r, "accessible") for r in local]
        seen = {s.full_name for s in suggestions}

        owner_items: list[dict[str, Any]] = []
        if owner and (partial or "/" in needle or len(owner) >= 2):
            owner_items = await _list_owner_repos(client, owner)
            if partial:
                owner_items = [r for r in owner_items if partial in (r.get("name") or "").lower()]
            for item in owner_items[:10]:
                sugg = _to_sugg(item, "org")
                if sugg.full_name and sugg.full_name not in seen:
                    suggestions.append(sugg)
                    seen.add(sugg.full_name)
                if len(suggestions) >= 10:
                    break

        if len(suggestions) >= 5:
            return LookaheadResponse(suggestions=suggestions, searched=False)

        cached = _search_cache.get(needle)
        searched = False
        if cached and time.monotonic() - cached[0] < SEARCH_TTL_S:
            search_items = cached[1]
            searched = True
        else:
            if not await _take_search_token():
                return LookaheadResponse(
                    suggestions=suggestions,
                    searched=False,
                    rate_limited=True,
                    message="GitHub lookahead is rate-limited right now. Paste the full owner/name and we'll validate it.",
                )
            search_q = f"{partial} user:{owner}" if "/" in needle and partial else needle
            r = await client.get(f"{GH}/search/repositories", params={"q": search_q, "per_page": 8})
            if r.status_code == 200:
                search_items = (r.json() or {}).get("items") or []
                _search_cache[needle] = (time.monotonic(), search_items)
                searched = True
            else:
                search_items = []

        for item in search_items:
            sugg = _to_sugg(item, "search")
            if sugg.full_name and sugg.full_name not in seen:
                suggestions.append(sugg)
                seen.add(sugg.full_name)
            if len(suggestions) >= 10:
                break
        return LookaheadResponse(suggestions=suggestions, searched=searched)
