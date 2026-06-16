# TTT ↔ CAIPE Integration

This document describes how Tiny Teams with Tokens (TTT) is hosted as a
**CAIPE Agentic App** and the **JWT trust contract** the FastAPI backend
must implement before TTT is exposed in non-development environments.

## Topology

```
Browser
  │  https://caipe.example/apps/ttt/...
  ▼
┌──────────────────────────────────────────────────────┐
│ CAIPE host (Next.js, port 3000)                      │
│  - NextAuth session  → user OIDC id_token            │
│  - /apps/[appId]/[[...path]]/route.ts                │
│    · install + RBAC gate                              │
│    · strips client Authorization                      │
│    · forwards `Authorization: Bearer <id_token>`     │
│    · sets x-caipe-app-id / x-caipe-user /            │
│             x-caipe-roles (non-authoritative)        │
│    · preserveMountPath=true → upstream URL keeps     │
│      `/apps/ttt` so Next.js basePath resolves        │
└─────────────────────────┬────────────────────────────┘
                          │  http://ttt-frontend:3001/apps/ttt/...
                          ▼
┌──────────────────────────────────────────────────────┐
│ ttt-frontend (Next.js 15 with basePath=/apps/ttt)    │
│  next.config.js:                                      │
│    basePath:    process.env.BASE_PATH || "/ttt"      │
│    rewrites:    /api/:path*  → $TTT_API_URL/api/...  │
│  Required env when behind CAIPE:                      │
│    CAIPE_PROXY=1                                     │
│    BASE_PATH=/apps/ttt                                │
│    TTT_API_URL=http://ttt-backend:8765                │
└─────────────────────────┬────────────────────────────┘
                          │  http://ttt-backend:8765/api/...
                          ▼
┌──────────────────────────────────────────────────────┐
│ ttt-backend (FastAPI)                                │
│  Validates `Authorization: Bearer <id_token>` against│
│  CAIPE's IdP JWKS endpoint (see JWT contract below). │
└──────────────────────────────────────────────────────┘
```

CAIPE only ever talks to `ttt-frontend`. The frontend handles the `/api/*`
hop into FastAPI internally, so CAIPE has no opinion about the backend's
URL beyond what the Next rewrite resolves.

## JWT trust contract (what CAIPE sends, what TTT must verify)

CAIPE's Agentic App execution gateway forwards three relevant headers:

| Header             | Value                                              | Authoritative? |
|--------------------|----------------------------------------------------|----------------|
| `Authorization`    | `Bearer <id_token>` — user's OIDC id_token         | **Yes**        |
| `x-caipe-app-id`   | `ttt`                                              | No (audit hint)|
| `x-caipe-user`     | session user id (subject of the id_token)          | No (audit hint)|
| `x-caipe-roles`    | comma-separated roles (`user`, `admin`, …)         | No (audit hint)|

**Rule:** the FastAPI middleware MUST treat the `x-caipe-*` headers as
non-authoritative log/audit metadata. Identity decisions are based **only**
on the JWT signature, issuer, audience, and expiry.

### What TTT's middleware must do

1. Read `Authorization: Bearer <token>` from the request.
   - Reject the request if the header is missing or malformed.
2. Fetch and cache the JWKS from `TTT_JWT_JWKS_URI` (rotate on `kid` miss).
3. Verify:
   - signature against the JWKS,
   - `iss` claim matches `TTT_JWT_ISSUER`,
   - `aud` claim contains `TTT_JWT_AUDIENCE`,
   - `exp` is in the future, `nbf`/`iat` aren't in the future,
   - reject `alg: none` and refuse algorithms not in your allow-list
     (recommend RS256 / ES256).
4. On success, expose the verified claims (`sub`, `email`, etc.) to your
   request handlers. Don't trust unverified body fields for identity.

### Recommended FastAPI middleware skeleton

```python
# backend/ttt/auth.py
import os
from typing import Any
from fastapi import Depends, HTTPException, Request, status
from jose import jwt, JWTError, jwk
import httpx

_JWKS_CACHE: dict[str, Any] = {"keys": None}

JWKS_URI = os.environ["TTT_JWT_JWKS_URI"]
ISSUER   = os.environ["TTT_JWT_ISSUER"]
AUDIENCE = os.environ["TTT_JWT_AUDIENCE"]
ALG_ALLOWLIST = ("RS256", "ES256")
DEV_DISABLE   = os.getenv("TTT_JWT_DISABLED", "").lower() == "true"

async def _load_jwks() -> dict:
    if _JWKS_CACHE["keys"] is None:
        async with httpx.AsyncClient(timeout=5) as c:
            res = await c.get(JWKS_URI)
            res.raise_for_status()
            _JWKS_CACHE["keys"] = res.json()
    return _JWKS_CACHE["keys"]

async def require_caipe_user(request: Request) -> dict[str, Any]:
    if DEV_DISABLE:           # dev/loopback only — never in prod
        return {"sub": "dev-user", "roles": ["user"]}

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer")
    token = auth.removeprefix("Bearer ").strip()

    jwks = await _load_jwks()
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") not in ALG_ALLOWLIST:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "alg not allowed")
        key = next(k for k in jwks["keys"] if k["kid"] == header["kid"])
        claims = jwt.decode(
            token,
            jwk.construct(key).to_pem(),
            algorithms=list(ALG_ALLOWLIST),
            audience=AUDIENCE,
            issuer=ISSUER,
        )
    except (JWTError, StopIteration, KeyError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "jwt verify failed") from exc

    return claims
```

Then on each protected route:

```python
@router.get("/projects")
async def list_projects(user = Depends(require_caipe_user)):
    ...
```

### Required env vars on the FastAPI deployment

| Variable                | Purpose                                                   | Example                                                                      |
|-------------------------|-----------------------------------------------------------|------------------------------------------------------------------------------|
| `TTT_JWT_JWKS_URI`      | IdP JWKS endpoint                                         | `https://sso-dbbfec7f.sso.duosecurity.com/oidc/DI5E9AW1V6Y2556YLLFV/jwks`    |
| `TTT_JWT_ISSUER`        | Expected `iss` claim                                      | `https://sso-dbbfec7f.sso.duosecurity.com/oidc/DI5E9AW1V6Y2556YLLFV`         |
| `TTT_JWT_AUDIENCE`      | Expected `aud` claim                                      | `DI5E9AW1V6Y2556YLLFV` (CAIPE's OIDC client id by default)                   |
| `TTT_JWT_DISABLED`      | Skip verification entirely (dev only — fails in prod)     | `true` (loopback dev), `false`/unset (prod)                                  |

> The exact issuer/JWKS URL depends on which IdP CAIPE is configured against
> in the deployment environment. The CAIPE side has the matching variables
> `AGENTIC_APP_TTT_JWT_ISSUER`, `AGENTIC_APP_TTT_JWT_JWKS_URI`,
> `AGENTIC_APP_TTT_JWT_AUDIENCE`. Both sides must point at the same IdP.

### Why a header, not a cookie?

CAIPE deliberately does **not** forward its session cookie to apps. The
session cookie is host-scoped, HttpOnly, and tied to the CAIPE origin. The
id_token is the only identity material the gateway exchanges with apps,
delivered as `Authorization: Bearer <jwt>` on every request. This means TTT
never needs `Set-Cookie`/CSRF integration with the host and can be
deployed to any pod without sharing a cookie domain.

## Local development without JWT verification

For loopback development, set `TTT_JWT_DISABLED=true` on the FastAPI side
(matched by `AGENTIC_APP_TTT_JWT_DISABLED=true` on the CAIPE side). The
host still strips client-supplied `Authorization` and injects its own
Bearer header; the backend just doesn't verify it. Never set this flag
in any environment that accepts external traffic.
