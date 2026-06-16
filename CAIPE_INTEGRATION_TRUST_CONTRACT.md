# CAIPE ↔ TTT Embedded App Trust Contract

## The big picture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser tab @ http://localhost:3000                                  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ CAIPE shell page (Next.js)         /apps/embed/ttt             │  │
│  │ ┌────────────────────────────────────────────────────────────┐ │  │
│  │ │ AppHeader (CAIPE chrome)                                   │ │  │
│  │ ├────────────────────────────────────────────────────────────┤ │  │
│  │ │ Toolbar: "Tiny Teams with Tokens · embedded · Open in tab" │ │  │
│  │ ├────────────────────────────────────────────────────────────┤ │  │
│  │ │  <iframe src="/apps/ttt">              SAME ORIGIN         │ │  │
│  │ │  ┌──────────────────────────────────────────────────────┐  │ │  │
│  │ │  │  TTT React app (served by upstream Next on :3001)    │  │ │  │
│  │ │  │  Document origin: http://localhost:3000              │  │ │  │
│  │ │  │  fetch("/apps/ttt/api/projects") ─────┐              │  │ │  │
│  │ │  └───────────────────────────────────────┼──────────────┘  │ │  │
│  │ └──────────────────────────────────────────┼─────────────────┘ │  │
│  └─────────────────────────────────────────────┼──────────────────┘  │
│  Cookies in this tab:                          │                     │
│   __Secure-next-auth.session-token  (HttpOnly, Secure, SameSite=Lax) │
│  ─── auto-sent on every same-origin request ───┘                     │
└────────────────────────────────────────┬─────────────────────────────┘
                                         │
                                         ▼
                ┌────────────────────────────────────────┐
                │ CAIPE Next.js server                   │
                │ /apps/[appId]/[[...path]]/route.ts     │
                │                                        │
                │ 1. Validate session cookie             │
                │ 2. Read OIDC id_token from session     │
                │ 3. Look up app in Mongo                │
                │ 4. evaluateAppAccess(user, manifest)   │
                │ 5. Strip Authorization/x-caipe-*       │
                │ 6. Add Authorization: Bearer <id_token>│
                │ 7. Add x-caipe-app-id, -user, -roles   │
                │ 8. fetch(upstream, decorated headers)  │
                └────────────────────┬───────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────┐
                │ TTT frontend (Next, :3001)             │
                │ basePath=/apps/ttt                     │
                │  ┌──────────────────────────────────┐  │
                │  │ /api/* → rewrite to FastAPI      │  │
                │  └──────────────────────────────────┘  │
                └────────────────────┬───────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────┐
                │ TTT FastAPI backend (:8765)            │
                │ JWT middleware:                        │
                │  1. Read Authorization: Bearer <jwt>   │
                │  2. Fetch JWKS (cached)                │
                │  3. Verify signature, iss, aud, exp    │
                │  4. Authorize per app policy          │
                └────────────────────────────────────────┘
```

## The token plumbing in 6 steps

### Step 1 — User logs into CAIPE
NextAuth runs the OIDC dance with the IdP (Cisco SSO / Backstage). It receives an `id_token` (signed JWT with claims like `sub`, `email`, `groups`). Instead of exposing the JWT to the browser, NextAuth:

- Stores the `id_token` in the **server-side session record**.
- Sends a single opaque cookie back: `__Secure-next-auth.session-token` with `HttpOnly; Secure; SameSite=Lax`.

The browser now has an unreadable cookie. The actual JWT lives only on CAIPE's server.

### Step 2 — User navigates to `/apps/embed/ttt`
The embed shell page renders inside CAIPE's `(app)` layout — that's why the CAIPE header is visible above the iframe. The page is just a thin client component that:

1. Fetches `/api/agentic-apps` to verify the user is allowed to launch this app.
2. Renders `<iframe src="/apps/ttt">` if allowed, or an error card otherwise.

The iframe `src` is a **same-origin** path — no cross-origin gymnastics.

### Step 3 — Iframe loads its initial HTML
The browser issues `GET http://localhost:3000/apps/ttt`. Because this is same-origin to the parent tab, the session cookie is automatically attached.

This URL hits CAIPE's catch-all proxy route `apps/[appId]/[[...path]]/route.ts`. That route:

1. Calls `getAuthenticatedUser(req)` — reads the cookie, validates the session, returns `{ user, session }` including `session.idToken`.
2. Loads the app's manifest + installation from Mongo.
3. Runs `evaluateAppAccess({ user, session, pkg, installation })` — RBAC, install/enabled state, runtime kind, health.
4. If access is denied, returns `401`/`403`/`404` here. **The browser never reaches TTT.**
5. Strips dangerous headers from the inbound request: client-supplied `Authorization`, `x-caipe-*` (defense in depth).
6. **Synthesizes** the upstream Authorization header from the server-side `id_token`:
   ```
   Authorization: Bearer <oidc id_token>
   x-caipe-app-id: ttt
   x-caipe-user: <session.sub or sha256(email)>
   x-caipe-roles: admin,user
   ```
7. Forwards to `http://localhost:3001/apps/ttt`. With `preserveMountPath: true`, the upstream sees `/apps/ttt` (matches its Next basePath).

### Step 4 — TTT verifies the JWT
TTT's FastAPI middleware (per the `CAIPE_INTEGRATION.md` contract):

1. Reads `Authorization: Bearer <jwt>`.
2. Fetches JWKS from CAIPE's IdP (cached).
3. Verifies signature, `iss`, `aud` (TTT's expected audience), `exp`, `iat`.
4. On success, attaches the verified claims to the request context. Apps may additionally check `x-caipe-app-id` matches their own id (replay protection across apps).
5. On failure, returns `401`. CAIPE's proxy passes that 401 right back through.

The `x-caipe-user` and `x-caipe-roles` headers are **non-authoritative hints** — TTT MUST verify the bearer JWT before trusting any of them. They exist only to reduce token-decoding work and give logs a stable correlation id.

### Step 5 — Iframe-internal fetches re-enter the same flow
Once TTT's React bundle is loaded inside the iframe, every fetch it makes (e.g. `fetch("/apps/ttt/api/projects")`) is **same-origin** to CAIPE because the iframe document origin is `http://localhost:3000`. The browser:

1. Auto-attaches the session cookie.
2. Sends the request to CAIPE's proxy.
3. CAIPE re-runs steps 3–4 above for each request — fresh access check, fresh `Authorization: Bearer` header injection.

**The browser never holds, sees, or transmits the JWT itself.** It only holds an opaque session cookie.

### Step 6 — Logout invalidates everything
When the user logs out of CAIPE, NextAuth clears the session record + cookie. The next iframe request has no valid session → CAIPE proxy returns 401 → TTT never even gets called. No token revocation needed because the proxy is the only thing that can mint bearer tokens.

## Why same-origin matters

| Property | Same-origin iframe (our setup) | Cross-origin iframe |
|---|---|---|
| Session cookie auto-sent on iframe requests | ✅ | ❌ (third-party cookies blocked) |
| Parent can server-side inject Authorization | ✅ via proxy | ❌ — iframe makes its own requests |
| JS in iframe can read the JWT | ❌ (good — HttpOnly, server-side) | ❌ |
| `frame-ancestors 'self'` allows it | ✅ | ❌ |
| postMessage required to share user info | Optional | Required |

Our scoped framing rule keeps it that way:
```
/apps/* → X-Frame-Options: SAMEORIGIN; CSP frame-ancestors 'self'
everywhere else → X-Frame-Options: DENY; CSP frame-ancestors 'none'
```

So **only CAIPE itself** (running on the same origin) can frame these proxy responses. Any third-party site trying to embed `https://caipe.cisco.com/apps/ttt` in its own iframe would be blocked by the browser at the framing check, before any auth even runs.

## What CAIPE guarantees to the upstream app

1. **The bearer JWT is valid OIDC** issued by CAIPE's IdP, signed with a key in CAIPE's published JWKS.
2. **The user is authenticated** (session existed, cookie was valid, not expired).
3. **The user passed `evaluateAppAccess`** for this specific app (RBAC roles, installed, enabled, runtime supported, health OK).
4. **No client-supplied Authorization or x-caipe-* headers leaked through** — the proxy strips them.
5. **The iframe origin matches CAIPE's origin** — enforced by `frame-ancestors 'self'`.
6. **The app's mount path is preserved** when `preserveMountPath: true` (so basePath + asset URLs work).

## What the upstream app MUST do

1. **Verify the bearer JWT against CAIPE's JWKS on every request.** Do not trust the proxy — defense in depth.
2. **Validate `iss` and `aud`.** Reject tokens issued for other apps even if they're cryptographically valid.
3. **Reject expired tokens** (don't allow clock skew > 60s).
4. **Treat `x-caipe-*` headers as hints, not credentials.** Verify the JWT first; only then trust the claims.
5. **Don't store CAIPE session cookies.** Apps shouldn't try to read or set the parent's NextAuth cookie — that's CAIPE's job.

## What the upstream app MUST NOT do

1. **Bypass CAIPE.** Don't expose the FastAPI port externally; the only legitimate path is via CAIPE's proxy. We achieve this by binding the backend to `127.0.0.1` only or, in k8s, running it as a `ClusterIP` Service with no external Ingress.
2. **Mint its own session cookies** scoped to `caipe.cisco.com`. That would override CAIPE's session and break SSO.
3. **Trust client-supplied identity headers.** Even though the proxy strips them on entry, defense in depth: an app's middleware should reject any `x-caipe-user` that arrives without a verified Bearer JWT.
4. **Send `X-Frame-Options: DENY` from inside its own response.** It would be ignored anyway (the proxy strips it), but apps that follow this contract should know they're being framed and behave accordingly (e.g., don't show a "we appear to be embedded, please open us in a new tab" warning by default).

## Failure modes covered

| What goes wrong | What stops it |
|---|---|
| User has no CAIPE session | Proxy returns 401, iframe shows TTT never even reached |
| User has session but lacks role | `evaluateAppAccess` returns blocked, proxy returns 403/404 |
| App is disabled in admin panel | `installation.enabled = false` → blocked at proxy |
| App health is `unreachable` | Health check fails proxy (configurable) |
| Attacker tries to frame `/apps/ttt` from `evil.com` | Browser blocks via `X-Frame-Options: SAMEORIGIN` |
| XSS in TTT tries to steal the token | JWT is server-side only; cookie is HttpOnly |
| Stolen session cookie | Tied to user agent and IP via NextAuth options; revocable on logout |
| Forged JWT | TTT's JWKS verification fails — 401 |
| Token replay across apps | TTT verifies `aud`; rejects tokens for other apps |
| Compromised app exfiltrates JWT | Limited to that app's own audience; rotates with session |

## TL;DR

CAIPE acts as a **server-side bearer-token relay**. The browser only carries an opaque session cookie. The same-origin iframe makes the JWT injection feel transparent: every fetch the iframe issues hits CAIPE's proxy, which decorates it with a fresh `Authorization: Bearer <id_token>` before forwarding to the upstream app. The upstream app verifies the JWT against CAIPE's JWKS and authorizes accordingly. No tokens ever live in browser-accessible storage or cross origin boundaries.