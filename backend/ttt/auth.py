"""JWT authentication middleware and user-context helpers for the CAIPE deployment.

JwtUserContext and the identity-extraction logic are adapted from
cnoe-io/ai-platform-engineering/ai_platform_engineering/utils/auth/jwt_context.py.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from jose import JWTError, jwk, jwt
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from ttt.config import settings

log = logging.getLogger("ttt.auth")


# ── JwtUserContext ────────────────────────────────────────────────────────

@dataclass(frozen=True)
class JwtUserContext:
    """Immutable snapshot of user identity extracted from a JWT."""

    sub: str = ""
    email: str = "unknown"
    name: str | None = None
    groups: list[str] = field(default_factory=list)
    token: str = ""


_jwt_user_context_var: ContextVar[JwtUserContext | None] = ContextVar(
    "jwt_user_context", default=None
)


def set_jwt_user_context(ctx: JwtUserContext) -> None:
    _jwt_user_context_var.set(ctx)


def get_jwt_user_context() -> JwtUserContext | None:
    return _jwt_user_context_var.get()


# ── Claim extraction helpers ──────────────────────────────────────────────

def _decode_jwt_payload(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("token does not have three dot-separated segments")
    payload_b64 = parts[1]
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding
    return json.loads(base64.urlsafe_b64decode(payload_b64))


def _extract_email(claims: dict) -> str:
    return (
        claims.get("email")
        or claims.get("preferred_username")
        or claims.get("upn")
        or claims.get("sub")
        or "unknown"
    )


def _extract_name(claims: dict) -> str | None:
    for key in ("name", "fullname", "display_name", "displayName"):
        if val := claims.get(key):
            return str(val).strip()
    given = claims.get("given_name") or claims.get("givenName")
    family = claims.get("family_name") or claims.get("familyName")
    if given and family:
        return f"{given} {family}".strip()
    if given:
        return str(given).strip()
    return None


_GROUP_CLAIM_KEYS = ("members", "memberOf", "groups", "group", "roles", "cognito:groups")


def _extract_groups(claims: dict) -> list[str]:
    groups: list[str] = []
    for key in _GROUP_CLAIM_KEYS:
        val = claims.get(key)
        if isinstance(val, list):
            groups.extend(str(g) for g in val)
        elif isinstance(val, str) and val:
            groups.extend(g.strip() for g in val.split(",") if g.strip())
    return groups


# ── OIDC userinfo enrichment ──────────────────────────────────────────────

_discovery_state: dict[str, Any] = {"doc": None, "expiry": 0.0}
_DISCOVERY_TTL = 3600.0

_userinfo_cache: dict[str, tuple[dict, float]] = {}
_USERINFO_TTL = 600.0


async def _get_oidc_discovery() -> dict[str, Any] | None:
    now = time.monotonic()
    if _discovery_state["doc"] and now < _discovery_state["expiry"]:
        return _discovery_state["doc"]
    issuer = settings.ttt_jwt_issuer
    if not issuer:
        return None
    url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            doc = resp.json()
            _discovery_state["doc"] = doc
            _discovery_state["expiry"] = now + _DISCOVERY_TTL
            return doc
    except Exception:
        log.warning("failed to fetch OIDC discovery document", exc_info=True)
        return None


async def _fetch_userinfo(token: str) -> dict[str, Any] | None:
    discovery = await _get_oidc_discovery()
    if not discovery:
        return None
    endpoint = discovery.get("userinfo_endpoint")
    if not endpoint:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            return resp.json()
    except Exception:
        log.warning("failed to fetch userinfo", exc_info=True)
        return None


async def _fetch_userinfo_cached(token: str) -> dict[str, Any] | None:
    now = time.monotonic()
    key = hashlib.sha256(token.encode()).hexdigest()
    if key in _userinfo_cache:
        data, expires_at = _userinfo_cache[key]
        if now < expires_at:
            return data
        del _userinfo_cache[key]
    userinfo = await _fetch_userinfo(token)
    if userinfo:
        _userinfo_cache[key] = (userinfo, now + _USERINFO_TTL)
        if len(_userinfo_cache) > 1000:
            expired = [k for k, (_, exp) in _userinfo_cache.items() if now >= exp]
            for k in expired:
                del _userinfo_cache[k]
    return userinfo


async def extract_user_context_from_token(token: str) -> JwtUserContext:
    """Build a JwtUserContext from a verified JWT, optionally enriched via userinfo."""
    try:
        claims = _decode_jwt_payload(token)
    except Exception:
        log.warning("failed to decode JWT payload for user context", exc_info=True)
        return JwtUserContext(token=token)

    sub = claims.get("sub", "")
    email = _extract_email(claims)
    name = _extract_name(claims)
    groups = _extract_groups(claims)

    userinfo = await _fetch_userinfo_cached(token)
    if userinfo:
        ui_email = _extract_email(userinfo)
        if ui_email and ui_email != "unknown":
            email = ui_email
        ui_name = _extract_name(userinfo)
        if ui_name:
            name = ui_name
        ui_groups = _extract_groups(userinfo)
        if ui_groups:
            groups = ui_groups

    return JwtUserContext(sub=sub, email=email, name=name, groups=groups, token=token)


# ── JWKS verification cache ───────────────────────────────────────────────

_ALG_ALLOWLIST = ("RS256", "ES256")
_EXEMPT_PREFIXES = ("/api/internal/", "/healthz", "/readyz", "/metrics")

_jwks_cache: dict[str, Any] = {}


async def _fetch_jwks() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(settings.ttt_jwt_jwks_uri)
        resp.raise_for_status()
        return resp.json()


async def _get_key(kid: str) -> Any:
    if kid not in _jwks_cache:
        data = await _fetch_jwks()
        _jwks_cache.clear()
        for k in data.get("keys", []):
            _jwks_cache[k["kid"]] = k
    return _jwks_cache.get(kid)


# ── Middleware ────────────────────────────────────────────────────────────

class CaipeJWTMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or any(
            request.url.path.startswith(p) for p in _EXEMPT_PREFIXES
        ):
            return await call_next(request)

        if settings.ttt_jwt_disabled:
            # When running behind the CAIPE agentic-app proxy, the proxy
            # authenticates the user via SSO and forwards the identity as
            # `x-caipe-user` (+ comma-separated `x-caipe-roles`), stripping any
            # client-supplied copies. Trust those hints so projects are owned by
            # the real signed-in user and scope correctly; fall back to a fixed
            # dev user when the headers are absent (plain local dev).
            caipe_user = request.headers.get("x-caipe-user")
            if caipe_user:
                roles = request.headers.get("x-caipe-roles", "")
                groups = [g.strip() for g in roles.split(",") if g.strip()] or ["user"]
                ctx = JwtUserContext(
                    sub=caipe_user,
                    email=caipe_user,
                    name=caipe_user,
                    groups=groups,
                )
            else:
                ctx = JwtUserContext(
                    sub="dev-user@localhost",
                    email="dev-user@localhost",
                    name="Dev User",
                    groups=["user"],
                )
            set_jwt_user_context(ctx)
            request.state.user = ctx
            # Persist the identity so creator tracking / project listing resolve
            # against a real user row (no-op if it already exists).
            if ctx.sub:
                try:
                    await upsert_user(ctx)
                except Exception:
                    log.warning(
                        "failed to upsert user from CAIPE headers", exc_info=True
                    )
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "missing bearer"}, status_code=401)
        token = auth.removeprefix("Bearer ").strip()

        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in _ALG_ALLOWLIST:
                return JSONResponse({"detail": "alg not allowed"}, status_code=401)
            key = await _get_key(header.get("kid", ""))
            if key is None:
                return JSONResponse({"detail": "unknown kid"}, status_code=401)
            jwt.decode(
                token,
                jwk.construct(key).to_pem(),
                algorithms=list(_ALG_ALLOWLIST),
                audience=settings.ttt_jwt_audience,
                issuer=settings.ttt_jwt_issuer,
            )
        except JWTError as exc:
            log.warning("jwt verification failed: %s", exc)
            return JSONResponse({"detail": "jwt verify failed"}, status_code=401)
        except Exception as exc:
            log.warning("unexpected jwt error: %s", exc)
            return JSONResponse({"detail": "jwt verify failed"}, status_code=401)

        ctx = await extract_user_context_from_token(token)
        set_jwt_user_context(ctx)
        request.state.user = ctx
        if ctx.sub:
            try:
                await upsert_user(ctx)
            except Exception:
                log.warning("failed to upsert user from JWT context", exc_info=True)
        return await call_next(request)


class DevIdentityMiddleware(BaseHTTPMiddleware):
    """Injects a fixed JwtUserContext for every request when CAIPE_PROXY is
    False and TTT_DEV_USER_EMAIL is configured. Gives authz helpers a stable
    identity in local dev without requiring JWT auth."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        ctx = JwtUserContext(
            sub=settings.ttt_dev_user_email,
            email=settings.ttt_dev_user_email,
            name=settings.ttt_dev_user_name or settings.ttt_dev_user_email,
            groups=[],
        )
        set_jwt_user_context(ctx)
        request.state.user = ctx
        return await call_next(request)


# ── User upsert ───────────────────────────────────────────────────────────────

async def upsert_user(ctx: JwtUserContext) -> None:
    """Create or refresh the User row from the current JWT context.
    Called on every authenticated request so rows stay current."""
    from ttt.db import engine
    from ttt.models import User

    async with AsyncSession(engine, expire_on_commit=False) as session:
        existing = (
            await session.exec(select(User).where(User.sub == ctx.sub))
        ).first()
        if existing:
            existing.email = ctx.email
            if ctx.name:
                existing.name = ctx.name
            existing.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(existing)
        else:
            session.add(User(sub=ctx.sub, email=ctx.email, name=ctx.name))
        await session.commit()
