# Role-Based Access Control (RBAC)

Access to projects is controlled by per-project roles. A user gains access either through a direct assignment or through a group that has been assigned to the project.

---

## Roles

| Role | Description |
|---|---|
| `viewer` | Read-only access to project data, wiki pages, chat history, and ingest logs |
| `editor` | `viewer` + trigger ingest, send chat messages, write and delete wiki pages |
| `admin` | `editor` + modify project settings, add/remove sources (repos, Webex, Confluence), manage project members and group assignments |

Roles are ordered by privilege: `viewer` < `editor` < `admin`. When a user qualifies for multiple roles (e.g. directly as `viewer` and via a group as `editor`), the highest role wins.

---

## Global admins

Users with `"admin"` in their `User.roles` field bypass all per-project checks and can access any project with full admin privileges. This is intended for platform operators, not regular users.

Set a user's global role directly in the database or via a future admin API. It is not derived from the JWT.

---

## Role assignment

Roles can be assigned to individual users or to groups.

### Assigning a user directly

```http
POST /api/projects/{project_id}/members/users
Content-Type: application/json

{
  "user_id": "<uuid>",
  "role": "editor"
}
```

### Assigning a group

```http
POST /api/projects/{project_id}/members/groups
Content-Type: application/json

{
  "group_id": "<uuid>",
  "role": "viewer"
}
```

Valid roles for both: `"viewer"`, `"editor"`, `"admin"`.

### Changing a role

```http
PUT /api/projects/{project_id}/members/users/{user_id}
PUT /api/projects/{project_id}/members/groups/{group_id}

{ "role": "admin" }
```

### Removing a member

```http
DELETE /api/projects/{project_id}/members/users/{user_id}
DELETE /api/projects/{project_id}/members/groups/{group_id}
```

### Listing members

```http
GET /api/projects/{project_id}/members/users
GET /api/projects/{project_id}/members/groups
```

Both return a list of assignments with the user/group details and the assigned role.

---

## Project creator

The user who creates a project is automatically assigned the `admin` role on that project. This happens at `POST /api/projects` time using the `sub` claim from the request context — either the JWT in CAIPE mode or the configured dev identity in non-CAIPE mode.

---

## Groups

A group aggregates users so a single role assignment covers all of them. There are two kinds:

| Kind | How membership is determined |
|---|---|
| `local` | Explicit DB membership (`UserGroupMember` rows). Managed via the `/api/groups/{id}/members` API. |
| `external` | The group's `name` is matched against the JWT `groups` claim on each request. No DB membership records are needed. |

### Creating a group

```http
POST /api/groups
Content-Type: application/json

{ "name": "platform-engineers", "kind": "external" }
```

```http
POST /api/groups
Content-Type: application/json

{ "name": "wiki-editors", "kind": "local" }
```

### Managing local group members

Users are identified by their `user_id` (UUID). To find a user's ID, use `GET /api/users?q=<email>`. In CAIPE mode, `User` rows are created on first authenticated request; in non-CAIPE mode the dev user is provisioned on startup, and additional users can be created via `POST /api/users`.

```http
POST /api/groups/{group_id}/members
{ "user_id": "<uuid>" }

DELETE /api/groups/{group_id}/members/{user_id}

GET /api/groups/{group_id}/members
```

### Deleting a group

Deleting a group removes all its `UserGroupMember` rows and all `ProjectGroupRole` assignments across every project.

```http
DELETE /api/groups/{group_id}
```

---

## Role resolution order

When a request arrives, the user's effective role on a project is computed as follows:

1. **Direct membership** — look up `ProjectMember` for `(project_id, user_id)`.
2. **External groups** — find all `UserGroup` rows with `kind='external'` whose `name` appears in the JWT `groups` claim, then look up their `ProjectGroupRole` for this project.
3. **Local groups** — find all `UserGroupMember` rows for this `user_id`, then look up each group's `ProjectGroupRole` for this project.

The highest role found across all three sources is used.

---

## Project visibility

`GET /api/projects` returns only the projects the requesting user has a role on (viewer or above). Projects the user has no role on are not listed and return `403` on direct access.

Global admins see all projects.

---

## Authorization bypass (local dev)

When `TTT_JWT_DISABLED=true` (within CAIPE mode), the server generates a synthetic context for `dev-user@localhost` and **all authorization checks are skipped**. This is intended for CAIPE integration testing only and must never be enabled in production.

When `CAIPE_PROXY=false` (the default for local dev), JWT verification is not performed and per-project authorization checks are skipped entirely. However, a stable user identity is still injected if configured:

| Variable | Default | Description |
|---|---|---|
| `TTT_DEV_USER_EMAIL` | `dev@local` | Email / `sub` of the dev user auto-provisioned on startup |
| `TTT_DEV_USER_NAME` | `Dev User` | Display name |

When `TTT_DEV_USER_EMAIL` is set, `DevIdentityMiddleware` injects a `JwtUserContext` for that identity on every request, so creator tracking on new projects and project listing work correctly. The dev user is given a global admin role, meaning it would also pass any project-level check if authorization were ever enforced in this mode.

To add the dev user to all existing projects explicitly:

```bash
uv run ttt install-dev-user
```

## Project creator (non-CAIPE)

When `CAIPE_PROXY=false` and `TTT_DEV_USER_EMAIL` is set, the dev user is recorded as the creator of every new project (just as an authenticated user would be in CAIPE mode). If no dev user is configured, creator tracking is skipped.

---

## Data model

```
User ──────────────────── ProjectMember ─── Project
  │  (user_id, project_id, role)               │
  │                                             │
  └──── UserGroupMember ─── UserGroup ──── ProjectGroupRole
          (user_id, group_id)      (group_id, project_id, role)
```

Key tables:

| Table | Primary key | Purpose |
|---|---|---|
| `ProjectMember` | `(project_id, user_id)` | Direct user role on a project |
| `ProjectGroupRole` | `(project_id, group_id)` | Group role on a project |
| `UserGroup` | `id` | Named group (`local` or `external`) |
| `UserGroupMember` | `(group_id, user_id)` | Local group membership |
| `User` | `id` | Identity record; `sub` is the JWT subject (CAIPE) or dev user email (non-CAIPE) |
