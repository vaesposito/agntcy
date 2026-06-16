"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { ArrowDown, Check, Loader2, X } from "lucide-react";
import { api, type ConfluencePageRef, type RepoMeta, type RepoSuggestion, type WebexMeeting } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfluenceSelector } from "@/components/ConfluenceSelector";
import { CrepeEditor, type CrepeEditorHandle } from "@/components/CrepeEditor";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WebexMeetingsSelector } from "@/components/WebexMeetingsSelector";

type PendingRepo = {
  input: string;
  status: "idle" | "loading" | "ok" | "error";
  meta?: RepoMeta;
  error?: string;
};

const PHASES = ["prototype", "venture", "active", "sunset"] as const;
const CADENCES = ["weekly", "monthly", "quiet"] as const;

const STEPS = ["name", "charter", "phase", "cadence", "repos", "webex", "confluence", "review", "team"] as const;
type StepId = (typeof STEPS)[number];

type AddedUser = { id: string; email: string; name: string | null; role: string };
type AddedGroup = { id: string; name: string; role: string };

export default function NewProjectPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const [name, setName] = useState("");
  const [charter, setCharter] = useState("");
  const [phase, setPhase] = useState<string>("prototype");
  const [cadence, setCadence] = useState<string>("weekly");
  const [repos, setRepos] = useState<RepoMeta[]>([]);
  const [pending, setPending] = useState<PendingRepo>({ input: "", status: "idle" });
  const [suggestions, setSuggestions] = useState<RepoSuggestion[]>([]);
  const [lookaheadMsg, setLookaheadMsg] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const [meetings, setMeetings] = useState<WebexMeeting[]>([]);
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(new Set());
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const [confluencePages, setConfluencePages] = useState<Map<string, ConfluencePageRef>>(new Map());
  const [confluenceSessionKey, setConfluenceSessionKey] = useState<string | null>(null);

  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [githubSessionKey, setGithubSessionKey] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdId, setCreatedId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [userRole, setUserRole] = useState<string>("editor");
  const [addedUsers, setAddedUsers] = useState<AddedUser[]>([]);
  const [localGroups, setLocalGroups] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupRole, setGroupRole] = useState<string>("editor");
  const [addedGroups, setAddedGroups] = useState<AddedGroup[]>([]);

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const charterRef = useRef<CrepeEditorHandle | null>(null);
  const syncCharter = useCallback(() => {
    const md = charterRef.current?.getMarkdown();
    if (typeof md === "string") setCharter(md);
  }, []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<StepId, HTMLElement | null>>({
    name: null,
    charter: null,
    phase: null,
    cadence: null,
    repos: null,
    webex: null,
    confluence: null,
    review: null,
    team: null,
  });
  const [active, setActive] = useState<StepId>("name");

  const goTo = useCallback((id: StepId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    (document.activeElement as HTMLElement | null)?.blur();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      const focusable = el.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
      );
      if (focusable) {
        focusable.focus({ preventScroll: true });
      } else {
        el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      }
    }, 350);
  }, []);

  const next = useCallback(() => {
    const i = STEPS.indexOf(active);
    if (i < STEPS.length - 1) goTo(STEPS[i + 1]);
  }, [active, goTo]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive((visible.target as HTMLElement).dataset.step as StepId);
      },
      { root, threshold: [0.5, 0.75] },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (active === "charter") syncCharter();
      if (active === "review") submit();
      else next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, next, syncCharter]);

  useEffect(() => {
    api.getGlobalGitHubStatus().then((res) => {
      setGithubConnected(res.connected);
      setGithubLogin(res.github_login);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "github_oauth_complete") {
        setGithubConnected(true);
        setGithubLogin("connected");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const connectGitHub = useCallback(async () => {
    try {
      const { authorize_url, session_key } = await api.getGlobalGitHubAuthUrl();
      setGithubSessionKey(session_key);
      sessionStorage.setItem("github_oauth_session_key", session_key);
      window.open(authorize_url, "github_oauth", "width=600,height=700");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Re-run validate when GitHub is connected mid-session (e.g. user typed first,
  // then clicked Connect GitHub). Only fires when the session key transitions from
  // null to a real value and there is already failed/idle input to retry.
  const prevSessionKey = useRef<string | null>(null);
  useEffect(() => {
    if (!githubSessionKey || githubSessionKey === prevSessionKey.current) return;
    prevSessionKey.current = githubSessionKey;
    const url = pending.input.trim();
    if (!url || !url.includes("/") || pending.status === "ok") return;
    runValidate(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubSessionKey]);

  const debouncedLookahead = useDebounced(pending.input, 350);

  useEffect(() => {
    const q = debouncedLookahead.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLookaheadMsg(null);
      return;
    }
    let cancelled = false;
    api
      .lookaheadGithubRepos(q, githubSessionKey)
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.suggestions);
        setHighlight(0);
        setLookaheadMsg(res.rate_limited ? res.message : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedLookahead, githubSessionKey]);

  const runValidate = useCallback((raw: string) => {
    const url = raw.trim();
    if (!url || !url.includes("/")) {
      setPending((p) => ({ ...p, status: "idle", meta: undefined, error: undefined }));
      return;
    }
    setPending((p) => ({ ...p, status: "loading", meta: undefined, error: undefined }));
    api
      .validateGithubRepo(url, githubSessionKey)
      .then((res) => {
        if (res.ok && res.repo) {
          setPending((p) => ({ ...p, status: "ok", meta: res.repo, error: undefined }));
        } else {
          setPending((p) => ({ ...p, status: "error", meta: undefined, error: res.error || "Could not load repo." }));
        }
      })
      .catch((err) => {
        setPending((p) => ({ ...p, status: "error", error: (err as Error).message }));
      });
  }, [githubSessionKey]);

  const confirmRepo = () => {
    if (pending.status !== "ok" || !pending.meta) return;
    if (repos.some((r) => r.full_name === pending.meta!.full_name)) {
      setPending({ input: "", status: "idle" });
      return;
    }
    setRepos((prev) => [...prev, pending.meta!]);
    setPending({ input: "", status: "idle" });
  };

  const removeRepo = (full: string) => setRepos((prev) => prev.filter((r) => r.full_name !== full));

  const canSubmit = name.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    const latestCharter = charterRef.current?.getMarkdown() ?? charter;
    setCharter(latestCharter);
    setSubmitting(true);
    setError(null);
    try {
      const selectedList = meetings
        .filter((m) => selectedMeetings.has(m.id))
        .map((m) => ({ id: m.id, title: m.title, start: m.start }));

      const confluenceList = Array.from(confluencePages.values());

      const connectorData: Record<string, unknown> = {};
      if (selectedList.length > 0) connectorData.webex = { meetings: selectedList };
      if (confluenceList.length > 0) connectorData.confluence = { pages: confluenceList };

      const sessionKeys: Record<string, string> = {};
      if (sessionKey) sessionKeys.webex = sessionKey;
      if (confluenceSessionKey) sessionKeys.confluence = confluenceSessionKey;
      if (githubSessionKey) sessionKeys.github = githubSessionKey;

      const created = await api.createProject({
        name: name.trim(),
        charter: latestCharter.trim(),
        phase: phase || null,
        cadence: cadence || null,
        repos: repos.map((r) => `https://github.com/${r.full_name}`),
        connector_data: Object.keys(connectorData).length > 0 ? connectorData : null,
        session_keys: Object.keys(sessionKeys).length > 0 ? sessionKeys : null,
      });
      setCreatedId(created.id);
      setSubmitting(false);
      mutate("/api/projects");
      goTo("team");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const debouncedUserSearch = useDebounced(userSearch, 250);

  useEffect(() => {
    const q = debouncedUserSearch.trim();
    if (q.length < 2) {
      setUserResults([]);
      setUserSearching(false);
      return;
    }
    let cancelled = false;
    setUserSearching(true);
    api.searchUsers(q).then((res) => {
      if (cancelled) return;
      setUserResults(res);
      setUserSearching(false);
    }).catch(() => {
      if (cancelled) return;
      setUserResults([]);
      setUserSearching(false);
    });
    return () => { cancelled = true; };
  }, [debouncedUserSearch]);

  useEffect(() => {
    if (!createdId) return;
    api.listGroups().then((gs) => setLocalGroups(gs.filter((g) => g.kind === "local"))).catch(() => {});
  }, [createdId]);

  const addUser = useCallback(async () => {
    if (!selectedUser || !createdId) return;
    try {
      await api.addProjectMemberUser(createdId, selectedUser.id, userRole);
      setAddedUsers((prev) => [...prev, { ...selectedUser, role: userRole }]);
      setSelectedUser(null);
      setUserSearch("");
      setUserResults([]);
    } catch {
      // user already added or other error — silently ignore
    }
  }, [selectedUser, createdId, userRole]);

  const removeUser = useCallback(async (userId: string) => {
    if (!createdId) return;
    try { await api.removeProjectMemberUser(createdId, userId); } catch { /* ignore */ }
    setAddedUsers((prev) => prev.filter((u) => u.id !== userId));
  }, [createdId]);

  const addGroup = useCallback(async () => {
    if (!selectedGroupId || !createdId) return;
    const grp = localGroups.find((g) => g.id === selectedGroupId);
    if (!grp) return;
    try {
      await api.addProjectMemberGroup(createdId, selectedGroupId, groupRole);
      setAddedGroups((prev) => [...prev, { id: grp.id, name: grp.name, role: groupRole }]);
      setSelectedGroupId("");
    } catch {
      // already added or error — silently ignore
    }
  }, [selectedGroupId, createdId, groupRole, localGroups]);

  const removeGroup = useCallback(async (groupId: string) => {
    if (!createdId) return;
    try { await api.removeProjectMemberGroup(createdId, groupId); } catch { /* ignore */ }
    setAddedGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, [createdId]);

  const createAndAddUser = useCallback(async () => {
    if (!newUserEmail.trim()) return;
    if (!createdId) {
      setCreateUserError("Create the project first (Review step above).");
      return;
    }
    setCreatingUser(true);
    setCreateUserError(null);
    try {
      const u = await api.createUser({ email: newUserEmail.trim(), name: newUserName.trim() || undefined });
      await api.addProjectMemberUser(createdId, u.id, userRole);
      setAddedUsers((prev) => [...prev, { id: u.id, email: u.email, name: u.name, role: userRole }]);
      setShowCreateUser(false);
      setNewUserEmail("");
      setNewUserName("");
    } catch (err) {
      setCreateUserError((err as Error).message);
    } finally {
      setCreatingUser(false);
    }
  }, [newUserEmail, newUserName, createdId, userRole]);

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    setCreateGroupError(null);
    try {
      const g = await api.createGroup({ name: newGroupName.trim(), kind: "local" });
      setLocalGroups((prev) => [...prev, g]);
      setSelectedGroupId(g.id);
      setShowCreateGroup(false);
      setNewGroupName("");
    } catch (err) {
      setCreateGroupError((err as Error).message);
    } finally {
      setCreatingGroup(false);
    }
  }, [newGroupName]);

  const setRef = (id: StepId) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="text-sm font-semibold tracking-tight">New project</div>
        <div className="flex items-center gap-3">
          <ProgressDots active={active} />
          <ThemeToggle />
          <Button size="sm" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 snap-y snap-mandatory overflow-y-scroll scroll-smooth"
      >
        <Step
          id="name"
          setRef={setRef("name")}
          title="Let's get started."
          subtitle="What's the name of this new project?"
          help={
            <HelpBlock title="Naming">
              <p>
                A short, recognizable label. This shows up everywhere — sidebar, headers, the URL.
              </p>
              <p>Examples: <em>checkout-rewrite</em>, <em>q3-launch</em>, <em>internal-tools</em>.</p>
            </HelpBlock>
          }
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full bg-transparent text-3xl font-medium tracking-tight outline-none placeholder:text-neutral-400"
          />
          <StepActions canAdvance={name.trim().length > 0} onNext={next} />
        </Step>

        <Step
          id="charter"
          setRef={setRef("charter")}
          title="What's the charter?"
          subtitle="The persistent context the agents see on every ingest and chat. Take your time — this is the brief."
          help={
            <HelpBlock title="Writing a good charter">
              <p>
                Treat this like a 1-page README. The agents read it before every run, so detail pays
                off: goals, scope, non-goals, audience, current bet, where you are.
              </p>
              <p>
                Markdown works — headings, lists, links. Paste in an existing brief if you have one.
              </p>
            </HelpBlock>
          }
        >
          <div className="-mx-4 flex max-h-[calc(70vh_-_16rem)] min-h-[16rem] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 [&_.milkdown-host]:flex [&_.milkdown-host]:min-h-0 [&_.milkdown-host]:flex-1 [&_.milkdown-host]:flex-col [&_.milkdown-host]:overflow-y-auto [&_.milkdown]:flex [&_.milkdown]:min-h-0 [&_.milkdown]:flex-1 [&_.milkdown]:flex-col [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:flex-1">
            <CrepeEditor ref={charterRef} initialMarkdown={charter} />
          </div>
          <StepActions
            canAdvance
            onNext={() => {
              syncCharter();
              next();
            }}
            skipLabel={charter.trim() ? undefined : "Skip"}
          />
        </Step>

        <Step
          id="phase"
          setRef={setRef("phase")}
          title="What phase is this in?"
          subtitle="Lifecycle stage — drives signal-from-noise."
          help={
            <HelpBlock title="Phases">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>prototype</b> — exploring, expect churn</li>
                <li><b>venture</b> — committed bet, building toward a launch</li>
                <li><b>active</b> — operating, ongoing maintenance</li>
                <li><b>sunset</b> — winding down</li>
              </ul>
            </HelpBlock>
          }
        >
          <Segmented options={PHASES} value={phase} onChange={setPhase} />
          <StepActions canAdvance onNext={next} skipLabel={phase ? undefined : "Skip"} />
        </Step>

        <Step
          id="cadence"
          setRef={setRef("cadence")}
          title="How often does it change?"
          subtitle="Sets expectations for ingest frequency and noise tolerance."
          help={
            <HelpBlock title="Cadence">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>weekly</b> — high churn, expect updates often</li>
                <li><b>monthly</b> — steady, intermittent</li>
                <li><b>quiet</b> — long-lived, rarely changes</li>
              </ul>
            </HelpBlock>
          }
        >
          <Segmented options={CADENCES} value={cadence} onChange={setCadence} />
          <StepActions canAdvance onNext={next} skipLabel={cadence ? undefined : "Skip"} />
        </Step>

        <Step
          id="repos"
          setRef={setRef("repos")}
          title="Which repos belong to this project?"
          subtitle="We'll fetch each one from GitHub so you can confirm it's the right one."
          help={
            <HelpBlock title="Repos">
              <p>
                Enter as <code>owner/name</code> or paste a github.com URL. We hit the GitHub API to
                verify access and pull metadata.
              </p>
              <p>
                If a repo has a <code>.ttt/wiki.md</code> file, we'll surface it — handy for brownfield
                projects.
              </p>
              <p>Add as many as you need. You can also add more later.</p>
            </HelpBlock>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              {githubConnected ? (
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  Connected{githubLogin && githubLogin !== "connected" ? ` as @${githubLogin}` : ""} — private repos accessible
                </span>
              ) : (
                <>
                  <span className="text-sm text-neutral-500">Connect GitHub to access private repos</span>
                  <Button size="sm" variant="outline" onClick={connectGitHub} className="ml-auto">
                    Connect GitHub
                  </Button>
                </>
              )}
            </div>

            {repos.length > 0 && (
              <div className="space-y-2">
                {repos.map((r) => (
                  <RepoChip key={r.full_name} repo={r} onRemove={() => removeRepo(r.full_name)} />
                ))}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium">Add a repo</label>
            <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="relative">
                <div className="flex items-center px-4 py-3 focus-within:bg-neutral-50 dark:focus-within:bg-neutral-900/60">
                  <span className="font-mono text-sm text-neutral-400">github.com/</span>
                  <input
                    value={pending.input}
                    onChange={(e) => setPending({ input: e.target.value, status: "idle" })}
                    onBlur={(e) => runValidate(e.target.value)}
                    onKeyDown={(e) => {
                      if (suggestions.length === 0 || pending.status === "ok") return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlight((h) => (h + 1) % suggestions.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
                      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        const pick = suggestions[highlight];
                        if (pick) {
                          setPending({ input: pick.full_name, status: "idle" });
                          runValidate(pick.full_name);
                          setSuggestions([]);
                        }
                      } else if (e.key === "Escape") {
                        setSuggestions([]);
                      }
                    }}
                    placeholder="owner/name"
                    className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-neutral-400"
                  />
                </div>
                {suggestions.length > 0 && pending.status !== "ok" && (
                  <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                    {suggestions.map((s, i) => (
                      <li key={s.full_name}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setPending({ input: s.full_name, status: "idle" });
                            runValidate(s.full_name);
                            setSuggestions([]);
                          }}
                          className={
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left " +
                            (i === highlight
                              ? "bg-neutral-100 dark:bg-neutral-800"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
                          }
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{s.full_name}</span>
                              {s.private && (
                                <span className="rounded bg-neutral-200 px-1 py-0.5 text-[10px] uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                  private
                                </span>
                              )}
                            </div>
                            {s.description && (
                              <div className="truncate text-xs text-neutral-500">{s.description}</div>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">
                            {s.source === "search" ? "search" : s.source}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(pending.status === "loading" || pending.status === "error" || (pending.status === "ok" && pending.meta)) && (
                <hr className="border-neutral-200 dark:border-neutral-800" />
              )}

              {pending.status === "loading" && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking up…
                </div>
              )}
              {pending.status === "error" && (
                <div className="px-4 py-3 text-sm text-red-600 dark:text-red-400">{pending.error}</div>
              )}
              {pending.status === "ok" && pending.meta && (
                <div className="p-4">
                  <RepoPreview meta={pending.meta} />
                  <div className="mt-4 flex gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <Button size="sm" onClick={confirmRepo}>
                      <Check className="h-3 w-3" /> Add this repo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending({ input: "", status: "idle" })}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>
            </div>

            {lookaheadMsg && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                {lookaheadMsg}
              </div>
            )}
          </div>
          <StepActions canAdvance onNext={next} skipLabel={repos.length === 0 ? "Skip" : undefined} />
        </Step>

        <Step
          id="webex"
          setRef={setRef("webex")}
          title="Any Webex meetings to include?"
          subtitle="Optionally pull transcripts and summaries from recent meetings into the wiki."
          help={
            <HelpBlock title="Webex Meetings">
              <p>
                Connect your Webex account to see recent meetings. Selected meetings will have their
                transcripts and AI summaries ingested into the project wiki.
              </p>
              <p>
                You can skip this and add meetings later via the Reingest button.
              </p>
            </HelpBlock>
          }
        >
          <WebexMeetingsSelector
            disabled={submitting}
            selectedMeetings={selectedMeetings}
            onSelectedChange={setSelectedMeetings}
            meetings={meetings}
            onMeetingsChange={setMeetings}
            sessionKey={sessionKey}
            onSessionKeyChange={setSessionKey}
          />
          <StepActions canAdvance onNext={next} skipLabel={selectedMeetings.size === 0 ? "Skip" : undefined} />
        </Step>

        <Step
          id="confluence"
          setRef={setRef("confluence")}
          title="Any Confluence pages to include?"
          subtitle="Optionally pull page content and inline comments into the wiki."
          help={
            <HelpBlock title="Confluence Pages">
              <p>
                Connect your Atlassian account to browse Confluence spaces and pages.
                Selected pages will have their content and inline comments ingested.
              </p>
              <p>
                You can skip this and add Confluence pages later via the Reingest button.
              </p>
            </HelpBlock>
          }
        >
          <ConfluenceSelector
            disabled={submitting}
            selectedPages={confluencePages}
            onSelectedChange={setConfluencePages}
            sessionKey={confluenceSessionKey}
            onSessionKeyChange={setConfluenceSessionKey}
          />
          <StepActions canAdvance onNext={next} skipLabel={confluencePages.size === 0 ? "Skip" : undefined} />
        </Step>

        <Step
          id="review"
          setRef={setRef("review")}
          title="Ready to create."
          subtitle="Double-check, then we'll spin it up."
          help={
            <HelpBlock title="What happens next?">
              <p>
                The project is created immediately. You'll land on its wiki — empty until the first
                ingest, which you can kick off from the project page.
              </p>
            </HelpBlock>
          }
        >
          <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
            <dt className="text-neutral-500">Name</dt>
            <dd>{name || <span className="text-neutral-400">(required)</span>}</dd>
            <dt className="text-neutral-500">Charter</dt>
            <dd className="min-w-0">
              {charter ? (
                <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                  {charter}
                </div>
              ) : (
                <span className="text-neutral-400">(none)</span>
              )}
            </dd>
            <dt className="text-neutral-500">Phase</dt>
            <dd>{phase || <span className="text-neutral-400">(unset)</span>}</dd>
            <dt className="text-neutral-500">Cadence</dt>
            <dd>{cadence || <span className="text-neutral-400">(unset)</span>}</dd>
            <dt className="text-neutral-500">Repos</dt>
            <dd>
              {repos.length === 0 ? (
                <span className="text-neutral-400">(none)</span>
              ) : (
                <ul className="space-y-1">
                  {repos.map((r) => (
                    <li key={r.full_name} className="font-mono text-xs">{r.full_name}</li>
                  ))}
                </ul>
              )}
            </dd>
            <dt className="text-neutral-500">Meetings</dt>
            <dd>
              {selectedMeetings.size === 0 ? (
                <span className="text-neutral-400">(none)</span>
              ) : (
                <ul className="space-y-1">
                  {meetings
                    .filter((m) => selectedMeetings.has(m.id))
                    .map((m) => (
                      <li key={m.id} className="text-xs">{m.title}</li>
                    ))}
                </ul>
              )}
            </dd>
            <dt className="text-neutral-500">Confluence</dt>
            <dd>
              {confluencePages.size === 0 ? (
                <span className="text-neutral-400">(none)</span>
              ) : (
                <ul className="space-y-1">
                  {Array.from(confluencePages.values()).map((p) => (
                    <li key={p.page_id} className="text-xs">{p.title} <span className="text-neutral-400">({p.space_key})</span></li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>

          {error && (
            <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <Button onClick={submit} disabled={!canSubmit}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
            <Button variant="ghost" onClick={() => goTo("name")}>
              Start over
            </Button>
          </div>
        </Step>

        <Step
          id="team"
          setRef={setRef("team")}
          title="Add your team."
          subtitle="Assign collaborators before you start. You can always manage access later."
          help={
            <HelpBlock title="Team members">
              <p>Add collaborators before you start. You can always manage access later from project settings.</p>
              <ul className="list-disc pl-4 space-y-1 mt-2">
                <li><strong>viewer</strong> — read-only access to wiki, chat, and ingest logs</li>
                <li><strong>editor</strong> — can chat, trigger ingests, and edit wiki pages</li>
                <li><strong>admin</strong> — full access including project settings and member management</li>
              </ul>
            </HelpBlock>
          }
        >
          {!createdId && (
            <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
              Create the project in the Review step above before adding team members.
            </div>
          )}
          <div className="space-y-10">
            {/* Users panel */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Add users</h3>
              <div className="flex gap-2 items-start">
                <div className="relative flex-1">
                  {selectedUser ? (
                    <div className="flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
                      <span className="flex-1 truncate font-medium">{selectedUser.email}</span>
                      {selectedUser.name && <span className="text-neutral-500">{selectedUser.name}</span>}
                      <button
                        type="button"
                        onClick={() => { setSelectedUser(null); setUserSearch(""); }}
                        className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        aria-label="Clear selection"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by email or name…"
                        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
                      />
                      {userResults.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full rounded border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-900">
                          {userResults.map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                                onClick={() => {
                                  setSelectedUser(u);
                                  setUserSearch("");
                                  setUserResults([]);
                                }}
                              >
                                <span className="font-medium">{u.email}</span>
                                {u.name && <span className="ml-2 text-neutral-500">{u.name}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {userSearching && (
                        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-neutral-400" />
                      )}
                    </>
                  )}
                </div>
                <Segmented options={["viewer", "editor", "admin"] as const} value={userRole} onChange={setUserRole} />
                <Button
                  size="sm"
                  disabled={!selectedUser || !createdId}
                  onClick={addUser}
                >
                  Add
                </Button>
              </div>
              {addedUsers.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {addedUsers.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                      <span className="flex-1 truncate">{u.email}{u.name && <span className="ml-2 text-neutral-500">{u.name}</span>}</span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{u.role}</span>
                      <button type="button" onClick={() => removeUser(u.id)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!showCreateUser ? (
                <button
                  type="button"
                  onClick={() => setShowCreateUser(true)}
                  className="mt-3 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  + Create new user
                </button>
              ) : (
                <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <div className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">New user</div>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
                    />
                    <input
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Display name (optional)"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
                    />
                    {createUserError && (
                      <div className="text-xs text-red-600 dark:text-red-400">{createUserError}</div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={createAndAddUser} disabled={!newUserEmail.trim() || creatingUser}>
                        {creatingUser ? "Creating…" : "Create & Add"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowCreateUser(false); setNewUserEmail(""); setNewUserName(""); setCreateUserError(null); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Groups panel */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Add groups</h3>
              {localGroups.length > 0 && (
                <div className="flex gap-2 items-center mb-3">
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
                  >
                    <option value="">Select a group…</option>
                    {localGroups
                      .filter((g) => !addedGroups.some((ag) => ag.id === g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                  </select>
                  <Segmented options={["viewer", "editor", "admin"] as const} value={groupRole} onChange={setGroupRole} />
                  <Button size="sm" disabled={!selectedGroupId || !createdId} onClick={addGroup}>
                    Add
                  </Button>
                </div>
              )}

              {!showCreateGroup ? (
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(true)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  + Create new group
                </button>
              ) : (
                <div className="rounded border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <div className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">New local group</div>
                  <div className="space-y-2">
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Group name"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
                    />
                    {createGroupError && (
                      <div className="text-xs text-red-600 dark:text-red-400">{createGroupError}</div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={createGroup} disabled={!newGroupName.trim() || creatingGroup}>
                        {creatingGroup ? "Creating…" : "Create group"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowCreateGroup(false); setNewGroupName(""); setCreateGroupError(null); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {addedGroups.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {addedGroups.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                      <span className="flex-1 truncate">{g.name}</span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{g.role}</span>
                      <button type="button" onClick={() => removeGroup(g.id)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Bottom actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={() => createdId && router.push(`/projects/${createdId}`)} disabled={!createdId}>
                Finish
              </Button>
              <Button variant="ghost" onClick={() => createdId && router.push(`/projects/${createdId}`)} disabled={!createdId}>
                Skip
              </Button>
            </div>
          </div>
        </Step>
      </div>
    </div>
  );
}

function Step({
  id,
  setRef,
  title,
  subtitle,
  help,
  children,
}: {
  id: StepId;
  setRef: (el: HTMLElement | null) => void;
  title: string;
  subtitle?: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={setRef}
      data-step={id}
      className="flex h-full min-h-screen snap-start items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
        {subtitle && (
          <p className="mt-2 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        )}
        <div className="mt-8 grid grid-cols-1 gap-16 md:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">{children}</div>
          {help && <aside className="hidden md:block">{help}</aside>}
        </div>
      </div>
    </section>
  );
}

function StepActions({
  canAdvance,
  onNext,
  skipLabel,
}: {
  canAdvance: boolean;
  onNext: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <Button size="sm" onClick={onNext} disabled={!canAdvance}>
        {skipLabel ?? "Next"} <ArrowDown className="h-3 w-3" />
      </Button>
      <span className="text-xs text-neutral-400">
        or press <kbd className="font-mono">⌘↵</kbd> / <kbd className="font-mono">Ctrl↵</kbd>
      </span>
    </div>
  );
}

function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sticky top-24 text-sm text-neutral-500 dark:text-neutral-400">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {title}
      </div>
      <div className="space-y-3 leading-relaxed">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(selected ? "" : opt)}
            className={
              "rounded-full border px-4 py-2 text-sm transition-colors " +
              (selected
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500")
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RepoPreview({ meta }: { meta: RepoMeta }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-baseline gap-2">
        <a
          href={meta.html_url}
          target="_blank"
          rel="noreferrer"
          className="font-mono font-medium hover:underline"
        >
          {meta.full_name}
        </a>
        {meta.private && (
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            private
          </span>
        )}
        {meta.language && (
          <span className="text-xs text-neutral-500">{meta.language}</span>
        )}
        <span className="text-xs text-neutral-500">★ {meta.stargazers_count}</span>
      </div>
      {meta.description && <p className="text-neutral-600 dark:text-neutral-400">{meta.description}</p>}
      {meta.committers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Recent committers:</span>
          <div className="flex -space-x-1">
            {meta.committers.slice(0, 5).map((c) => (
              <img
                key={(c.login || c.name) ?? Math.random().toString()}
                src={c.avatar_url ?? ""}
                alt={c.login ?? c.name ?? ""}
                title={c.login ?? c.name ?? ""}
                className="h-5 w-5 rounded-full border border-white dark:border-neutral-900"
              />
            ))}
          </div>
        </div>
      )}
      {meta.ttt_wiki && (
        <details className="rounded border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <summary className="cursor-pointer text-neutral-500">Found .ttt/wiki.md</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
            {meta.ttt_wiki}
          </pre>
        </details>
      )}
    </div>
  );
}

function RepoChip({ repo, onRemove }: { repo: RepoMeta; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm">{repo.full_name}</span>
          {repo.ttt_wiki && (
            <span
              title=".ttt/wiki.md detected"
              className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              .ttt/wiki.md
            </span>
          )}
        </div>
        {repo.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{repo.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-0.5 shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        aria-label={`Remove ${repo.full_name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProgressDots({ active }: { active: StepId }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s) => (
        <span
          key={s}
          className={
            "h-1.5 w-6 rounded-full transition-colors " +
            (s === active
              ? "bg-neutral-900 dark:bg-neutral-100"
              : "bg-neutral-300 dark:bg-neutral-700")
          }
        />
      ))}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
