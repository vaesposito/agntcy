export type ProjectSummary = {
  id: string;
  name: string;
  locked: boolean;
  created_at: string;
  phase: string | null;
  cadence: string | null;
  repo_count: number;
  webex_room_count: number;
  confluence_space_count: number;
  latest_version: number | null;
  latest_ingested_at: string | null;
};

export type RepoOut = {
  id: string;
  project_id: string;
  slug: string;
  url: string;
  default_branch: string;
};

export type WebexRoomOut = {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  webex_id: string | null;
};

export type ConfluenceSpaceOut = {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  space_key: string;
  base_url: string;
};

export type ProjectDetail = ProjectSummary & {
  charter: string;
  ingest_config: Record<string, unknown>;
  repos: RepoOut[];
  webex_rooms: WebexRoomOut[];
  confluence_spaces: ConfluenceSpaceOut[];
  latest_run_id: string | null;
};

// Path resolution rules:
//  - When mounted behind a reverse proxy that sets a basePath (e.g. CAIPE
//    serves us at /apps/ttt), Next prefixes <Link>/router URLs automatically
//    but NOT plain `fetch("/api/...")` calls. We compensate here by
//    prepending the basePath that next.config.js exposed via
//    NEXT_PUBLIC_BASE_PATH.
//  - At runtime in the browser we additionally fall back to deriving the
//    basePath from window.location.pathname so the client works even if the
//    env var is misconfigured (defense-in-depth, mirrors the kaleidoscope
//    Agentic App pattern).
//  - Absolute URLs are returned unchanged.
//
// IMPORTANT: resolution happens lazily on every call. Computing it at module
// load freezes the value during SSR (when window is undefined and the env var
// is unset), and that empty string then ships in the client bundle and never
// updates — every fetch hits the wrong path.
function resolveBasePath(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_PATH;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    // Anything before "/api" or "/projects" is the mount path. Be conservative
    // — only pull a single leading "/segment[/segment]" prefix that looks
    // like an apps mount (e.g. "/apps/ttt") to avoid eating real route
    // segments.
    const m = window.location.pathname.match(/^(\/apps\/[^\/]+)(?:\/|$)/);
    if (m) return m[1];
  }
  return "";
}

/**
 * Lazy getter — call from request-time helpers, not at module top-level, so
 * the client picks up window.location even when NEXT_PUBLIC_BASE_PATH wasn't
 * set at build time.
 */
export function getBasePath(): string {
  return resolveBasePath();
}

/** @deprecated SSR-baked value. Prefer getBasePath() at call site. */
export const BASE_PATH = resolveBasePath();

export function withBasePath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getBasePath();
  if (!base) return path;
  return path.startsWith(base) ? path : `${base}${path}`;
}

/**
 * Resolve a backend (FastAPI) endpoint URL.
 *
 * - When mounted behind a basePath proxy (CAIPE), we go same-origin via the
 *   Next /api/* rewrite. Direct cross-origin calls would bypass CAIPE's auth
 *   and CSP, and would also not pick up the basePath in the browser.
 * - Standalone, we use the public NEXT_PUBLIC_TTT_API_URL (or localhost) so
 *   things like SSE streaming continue to work without a proxy.
 */
export function backendUrl(path: string): string {
  if (getBasePath()) {
    return withBasePath(path);
  }
  const root = process.env.NEXT_PUBLIC_TTT_API_URL || "http://localhost:8765";
  return path.startsWith("/") ? `${root}${path}` : `${root}/${path}`;
}

export async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBasePath(path), {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// SWR fetcher — pass URL as the SWR key.
export const swrFetcher = <T>(path: string) => req<T>(path);

export type PageKind = "stable" | "dynamic" | "hidden" | "report";
// `folder` is a sidebar-only marker for synthesized non-clickable headers
// (when nested children exist without a real `<dir>.md` parent page).
export type NodeKind = PageKind | "folder";

export type PageNode = {
  path: string;
  title: string;
  kind: NodeKind;
  order: number;
  children: PageNode[];
};

export type ReportTreeResponse = {
  id: string;
  project_id: string;
  version: number;
  ingested_at: string;
  summary: string;
  is_greenfield: boolean;
  page_tree: PageNode[];
};

export type PageResponse = {
  path: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  body: string;
  revision_id: string | null;
  updated_at: string | null;
  author: string | null;
};

export const api = {
  createProject: (body: {
    name: string;
    charter?: string;
    phase?: string | null;
    cadence?: string | null;
    repos?: string[];
    connector_data?: Record<string, unknown> | null;
    session_keys?: Record<string, string> | null;
  }) => req<ProjectSummary>("/api/projects", { method: "POST", body: JSON.stringify(body) }),

  updateProject: (
    id: string,
    body: {
      charter?: string;
      phase?: string | null;
      cadence?: string | null;
    },
  ) =>
    req<ProjectSummary>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  addRepo: (projectId: string, body: { url: string; slug?: string; default_branch?: string }) =>
    req<RepoOut>(`/api/projects/${projectId}/repos`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reingest: (
    projectId: string,
    body?: { seed?: string | null; connector_data?: Record<string, unknown> | null },
  ) =>
    req<{ run_id: string; status: string }>(
      `/api/projects/${projectId}/reingest`,
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),

  putPage: (projectId: string, version: number, pagePath: string, markdown: string) =>
    req<{ path: string }>(
      `/api/projects/${projectId}/reports/${version}/pages/${pagePath}`,
      { method: "PUT", body: JSON.stringify({ markdown }) },
    ),

  createPage: (
    projectId: string,
    version: number,
    body: {
      path: string;
      title: string;
      parent_path?: string;
      kind?: "stable" | "dynamic" | "hidden";
    },
  ) =>
    req<{ path: string; title: string; kind: string }>(
      `/api/projects/${projectId}/reports/${version}/pages`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  patchFrontmatter: (
    projectId: string,
    version: number,
    pagePath: string,
    body: { kind?: PageKind; title?: string; order?: number },
  ) =>
    req<{ path: string; frontmatter: Record<string, unknown> }>(
      `/api/projects/${projectId}/reports/${version}/pages/${pagePath}/frontmatter`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  deletePage: (projectId: string, version: number, pagePath: string) =>
    req<{ deleted: boolean; path: string }>(
      `/api/projects/${projectId}/reports/${version}/pages/${pagePath}`,
      { method: "DELETE" },
    ),

  cancelIngest: (projectId: string) =>
    req<{ status: string }>(`/api/projects/${projectId}/ingest/cancel`, { method: "POST" }),

  deleteProject: (projectId: string) =>
    req<void>(`/api/projects/${projectId}`, { method: "DELETE" }),

  resetChat: (projectId: string) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/chat/reset`, { method: "POST" }),

  pageHistory: (projectId: string, pagePath: string) =>
    req<RevisionSummary[]>(
      `/api/projects/${projectId}/pages/${pagePath}/history`,
    ),

  getRevision: (projectId: string, revisionId: string) =>
    req<RevisionDetail>(`/api/projects/${projectId}/revisions/${revisionId}`),

  validateGithubRepo: (url: string, sessionKey?: string | null) =>
    req<ValidateRepoResponse>(
      `/api/validate/github-repo${sessionKey ? `?session_key=${sessionKey}` : ""}`,
      { method: "POST", body: JSON.stringify({ url }) },
    ),

  lookaheadGithubRepos: (q: string, sessionKey?: string | null) =>
    req<LookaheadResponse>(
      `/api/lookahead/github-repos?q=${encodeURIComponent(q)}${sessionKey ? `&session_key=${sessionKey}` : ""}`,
    ),

  listWebexMeetings: (projectId: string) =>
    req<WebexMeeting[]>(`/api/projects/${projectId}/webex/meetings`),

  getWebexAuthUrl: (projectId: string) =>
    req<{ authorize_url: string }>(`/api/projects/${projectId}/oauth/webex/authorize`),

  exchangeWebexCode: (projectId: string, body: { code: string; state: string }) =>
    req<{ status: string }>(`/api/projects/${projectId}/oauth/webex/token`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getWebexOAuthStatus: (projectId: string) =>
    req<{ connected: boolean; expires_at: string | null; scope: string }>(
      `/api/projects/${projectId}/oauth/webex/status`,
    ),

  revokeWebexOAuth: (projectId: string) =>
    req<{ status: string }>(`/api/projects/${projectId}/oauth/webex`, {
      method: "DELETE",
    }),

  getGlobalWebexStatus: () =>
    req<{ connected: boolean }>("/api/oauth/webex/status"),

  getGlobalWebexAuthUrl: () =>
    req<{ authorize_url: string; session_key: string }>("/api/oauth/webex/authorize"),

  exchangeWebexCodeGlobal: (body: { code: string; state: string; session_key: string }) =>
    req<{ status: string; session_key: string }>("/api/oauth/webex/token", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listWebexMeetingsGlobal: (sessionKey?: string) =>
    req<WebexMeeting[]>(
      `/api/webex/meetings${sessionKey ? `?session_key=${sessionKey}` : ""}`,
    ),

  // Confluence OAuth
  getConfluenceOAuthStatus: (projectId: string) =>
    req<{ connected: boolean; expires_at: string | null; scope: string; site_url: string | null }>(
      `/api/projects/${projectId}/oauth/confluence/status`,
    ),

  getConfluenceAuthUrl: (projectId: string) =>
    req<{ authorize_url: string }>(`/api/projects/${projectId}/oauth/confluence/authorize`),

  exchangeConfluenceCode: (projectId: string, body: { code: string; state: string }) =>
    req<{ status: string }>(`/api/projects/${projectId}/oauth/confluence/token`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getGlobalConfluenceStatus: () =>
    req<{ connected: boolean }>("/api/oauth/confluence/status"),

  getGlobalConfluenceAuthUrl: () =>
    req<{ authorize_url: string; session_key: string }>("/api/oauth/confluence/authorize"),

  exchangeConfluenceCodeGlobal: (body: { code: string; state: string; session_key: string }) =>
    req<{ status: string; session_key: string }>("/api/oauth/confluence/token", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Confluence spaces/pages
  listConfluenceSpaces: (projectId: string) =>
    req<ConfluenceSpaceInfo[]>(`/api/projects/${projectId}/confluence/spaces`),

  listConfluencePages: (projectId: string, spaceId: string) =>
    req<ConfluencePageInfo[]>(`/api/projects/${projectId}/confluence/spaces/${spaceId}/pages`),

  listConfluenceSpacesGlobal: (sessionKey?: string) =>
    req<ConfluenceSpaceInfo[]>(
      `/api/confluence/spaces${sessionKey ? `?session_key=${sessionKey}` : ""}`,
    ),

  listConfluencePagesGlobal: (spaceId: string, sessionKey?: string) =>
    req<ConfluencePageInfo[]>(
      `/api/confluence/spaces/${spaceId}/pages${sessionKey ? `?session_key=${sessionKey}` : ""}`,
    ),

  // GitHub OAuth
  getGitHubOAuthStatus: (projectId: string) =>
    req<{ connected: boolean; github_login: string | null; expires_at: string | null }>(
      `/api/projects/${projectId}/oauth/github/status`,
    ),

  getGitHubAuthUrl: (projectId: string) =>
    req<{ authorize_url: string }>(`/api/projects/${projectId}/oauth/github/authorize`),

  exchangeGitHubCode: (projectId: string, body: { code: string; state: string }) =>
    req<{ status: string }>(`/api/projects/${projectId}/oauth/github/token`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revokeGitHubOAuth: (projectId: string) =>
    req<{ status: string }>(`/api/projects/${projectId}/oauth/github`, {
      method: "DELETE",
    }),

  getGlobalGitHubStatus: () =>
    req<{ connected: boolean; github_login: string | null }>("/api/oauth/github/status"),

  getGlobalGitHubAuthUrl: () =>
    req<{ authorize_url: string; session_key: string }>("/api/oauth/github/authorize"),

  exchangeGitHubCodeGlobal: (body: { code: string; state: string; session_key: string }) =>
    req<{ status: string; session_key: string }>("/api/oauth/github/token", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  searchUsers: (q: string) =>
    req<{ id: string; email: string; name: string | null }[]>(`/api/users?q=${encodeURIComponent(q)}`),

  createUser: (body: { email: string; name?: string }) =>
    req<{ id: string; email: string; name: string | null }>("/api/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listGroups: () =>
    req<{ id: string; name: string; kind: string }[]>("/api/groups"),

  createGroup: (body: { name: string; kind: string }) =>
    req<{ id: string; name: string; kind: string }>("/api/groups", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  addProjectMemberUser: (projectId: string, userId: string, role: string) =>
    req<{ project_id: string; user_id: string; role: string }>(
      `/api/projects/${projectId}/members/users`,
      { method: "POST", body: JSON.stringify({ user_id: userId, role }) },
    ),

  addProjectMemberGroup: (projectId: string, groupId: string, role: string) =>
    req<{ project_id: string; group_id: string; role: string }>(
      `/api/projects/${projectId}/members/groups`,
      { method: "POST", body: JSON.stringify({ group_id: groupId, role }) },
    ),

  removeProjectMemberUser: (projectId: string, userId: string) =>
    req<void>(`/api/projects/${projectId}/members/users/${userId}`, { method: "DELETE" }),

  removeProjectMemberGroup: (projectId: string, groupId: string) =>
    req<void>(`/api/projects/${projectId}/members/groups/${groupId}`, { method: "DELETE" }),
};

export type RepoSuggestion = {
  full_name: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
  language: string | null;
  source: "accessible" | "org" | "search";
};

export type LookaheadResponse = {
  suggestions: RepoSuggestion[];
  searched: boolean;
  rate_limited: boolean;
  message: string | null;
};

export type RepoCommitter = {
  login: string | null;
  name: string | null;
  avatar_url: string | null;
  commits: number;
};

export type RepoMeta = {
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  language: string | null;
  committers: RepoCommitter[];
  ttt_wiki: string | null;
};

export type ValidateRepoResponse = {
  ok: boolean;
  repo?: RepoMeta;
  error?: string;
};

export type RevisionSummary = {
  id: string;
  created_at: string;
  author: string;
  message: string;
  report_id: string | null;
};

export type RevisionDetail = RevisionSummary & {
  path: string;
  markdown: string;
  body: string;
  frontmatter: Record<string, unknown>;
};

export type WebexMeeting = {
  id: string;
  title: string;
  start: string;
  end: string;
  hostDisplayName: string;
  meetingType: string;
  hasTranscription: boolean;
  hasSummary: boolean;
};

export type ConfluenceSpaceInfo = {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
};

export type ConfluencePageInfo = {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  parentId: string | null;
};

export type ConfluencePageRef = {
  page_id: string;
  title: string;
  space_key: string;
};

export type IngestRunSummary = {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
  log_lines: number;
};

export type IngestRunDetail = {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
  log: string;
};

