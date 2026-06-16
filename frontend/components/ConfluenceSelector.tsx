"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ConfluenceSpaceInfo, ConfluencePageInfo, ConfluencePageRef } from "@/lib/api";

type Props = {
  projectId?: string;
  disabled?: boolean;
  selectedPages: Map<string, ConfluencePageRef>;
  onSelectedChange: (selected: Map<string, ConfluencePageRef>) => void;
  sessionKey: string | null;
  onSessionKeyChange: (key: string | null) => void;
};

type SpaceState = {
  pages: ConfluencePageInfo[];
  loading: boolean;
  loaded: boolean;
  expanded: boolean;
};

export function ConfluenceSelector({
  projectId,
  disabled,
  selectedPages,
  onSelectedChange,
  sessionKey,
  onSessionKeyChange,
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [spaces, setSpaces] = useState<ConfluenceSpaceInfo[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spaceStates, setSpaceStates] = useState<Record<string, SpaceState>>({});
  const indeterminateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setConnectLoading(true);
    if (projectId) {
      api
        .getConfluenceOAuthStatus(projectId)
        .then((status) => {
          setConnected(status.connected);
          if (status.connected) loadSpaces();
        })
        .catch(() => setConnected(false))
        .finally(() => setConnectLoading(false));
    } else {
      api
        .getGlobalConfluenceStatus()
        .then((status) => {
          setConnected(status.connected);
          if (status.connected) loadSpaces();
        })
        .catch(() => setConnected(false))
        .finally(() => setConnectLoading(false));
    }
  }, [projectId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "confluence_oauth_complete") {
        setConnected(true);
        loadSpaces();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [projectId, sessionKey]);

  function loadSpaces() {
    setSpacesLoading(true);
    const promise = projectId
      ? api.listConfluenceSpaces(projectId)
      : api.listConfluenceSpacesGlobal(sessionKey ?? undefined);
    promise
      .then(setSpaces)
      .catch(() => setSpaces([]))
      .finally(() => setSpacesLoading(false));
  }

  async function connectConfluence() {
    try {
      if (projectId) {
        const { authorize_url } = await api.getConfluenceAuthUrl(projectId);
        sessionStorage.setItem("confluence_oauth_project_id", projectId);
        window.open(authorize_url, "confluence_oauth", "width=600,height=700");
      } else {
        const { authorize_url, session_key } = await api.getGlobalConfluenceAuthUrl();
        onSessionKeyChange(session_key);
        sessionStorage.setItem("confluence_oauth_session_key", session_key);
        window.open(authorize_url, "confluence_oauth", "width=600,height=700");
      }
    } catch {
      // error will surface via the OAuth popup
    }
  }

  function loadPages(spaceId: string) {
    setSpaceStates((prev) => ({
      ...prev,
      [spaceId]: { ...prev[spaceId], loading: true, expanded: true, pages: prev[spaceId]?.pages ?? [], loaded: prev[spaceId]?.loaded ?? false },
    }));
    const promise = projectId
      ? api.listConfluencePages(projectId, spaceId)
      : api.listConfluencePagesGlobal(spaceId, sessionKey ?? undefined);
    promise
      .then((pages) => {
        setSpaceStates((prev) => ({
          ...prev,
          [spaceId]: { pages, loading: false, loaded: true, expanded: true },
        }));
      })
      .catch(() => {
        setSpaceStates((prev) => ({
          ...prev,
          [spaceId]: { pages: [], loading: false, loaded: true, expanded: true },
        }));
      });
  }

  function toggleSpace(spaceId: string) {
    const state = spaceStates[spaceId];
    if (!state || !state.loaded) {
      loadPages(spaceId);
      return;
    }
    setSpaceStates((prev) => ({
      ...prev,
      [spaceId]: { ...prev[spaceId], expanded: !prev[spaceId].expanded },
    }));
  }

  function toggleSpaceCheckbox(space: ConfluenceSpaceInfo) {
    const state = spaceStates[space.id];
    if (!state || !state.loaded) {
      loadPages(space.id);
      return;
    }
    const pages = state.pages;
    const allSelected = pages.every((p) => selectedPages.has(p.id));
    const next = new Map(selectedPages);
    if (allSelected) {
      for (const p of pages) next.delete(p.id);
    } else {
      for (const p of pages) {
        next.set(p.id, { page_id: p.id, title: p.title, space_key: space.key });
      }
    }
    onSelectedChange(next);
  }

  function togglePage(page: ConfluencePageInfo, spaceKey: string) {
    const next = new Map(selectedPages);
    if (next.has(page.id)) {
      next.delete(page.id);
    } else {
      next.set(page.id, { page_id: page.id, title: page.title, space_key: spaceKey });
    }
    onSelectedChange(next);
  }

  function getSpaceCheckState(spaceId: string): "none" | "some" | "all" {
    const state = spaceStates[spaceId];
    if (!state || !state.loaded || state.pages.length === 0) return "none";
    const selected = state.pages.filter((p) => selectedPages.has(p.id)).length;
    if (selected === 0) return "none";
    if (selected === state.pages.length) return "all";
    return "some";
  }

  useEffect(() => {
    for (const space of spaces) {
      const ref = indeterminateRefs.current[space.id];
      if (ref) {
        const checkState = getSpaceCheckState(space.id);
        ref.indeterminate = checkState === "some";
      }
    }
  });

  return (
    <div>
      <div className="mb-1 text-sm font-medium">Confluence Pages</div>
      <div className="mb-1.5 text-xs text-neutral-500">
        Optional. Select pages to ingest content and inline comments.
      </div>

      {connectLoading && (
        <p className="text-xs text-neutral-500">Checking Confluence connection...</p>
      )}

      {!connectLoading && connected === false && (
        <Button size="sm" variant="outline" onClick={connectConfluence} disabled={disabled}>
          Connect Confluence
        </Button>
      )}

      {!connectLoading && connected && spacesLoading && (
        <p className="text-xs text-neutral-500">Loading spaces...</p>
      )}

      {!connectLoading && connected && !spacesLoading && spaces.length === 0 && (
        <p className="text-xs text-neutral-500">No Confluence spaces found.</p>
      )}

      {!connectLoading && connected && !spacesLoading && spaces.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700">
          {spaces.map((space) => {
            const state = spaceStates[space.id];
            const expanded = state?.expanded ?? false;
            const checkState = getSpaceCheckState(space.id);
            return (
              <div key={space.id}>
                <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-800">
                  <input
                    ref={(el) => { indeterminateRefs.current[space.id] = el; }}
                    type="checkbox"
                    checked={checkState === "all"}
                    onChange={() => toggleSpaceCheckbox(space)}
                    disabled={disabled || !state?.loaded}
                    className="rounded"
                  />
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-1 text-left text-xs font-medium"
                    onClick={() => toggleSpace(space.id)}
                    disabled={disabled}
                  >
                    <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
                      <ChevronIcon />
                    </span>
                    <span className="truncate">{space.name}</span>
                    <span className="ml-1 text-neutral-400">({space.key})</span>
                  </button>
                </div>
                {expanded && state?.loading && (
                  <div className="px-8 py-1 text-xs text-neutral-400">Loading pages...</div>
                )}
                {expanded && state?.loaded && state.pages.length === 0 && (
                  <div className="px-8 py-1 text-xs text-neutral-400">No pages in this space.</div>
                )}
                {expanded &&
                  state?.loaded &&
                  state.pages.map((page) => (
                    <label
                      key={page.id}
                      className="flex items-center gap-2 px-8 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPages.has(page.id)}
                        onChange={() => togglePage(page, space.key)}
                        disabled={disabled}
                        className="rounded"
                      />
                      <span className="truncate">{page.title}</span>
                    </label>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}
