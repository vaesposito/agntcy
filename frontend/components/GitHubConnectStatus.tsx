"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function GitHubConnectStatus({ projectId }: { projectId: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [login, setLogin] = useState<string | null>(null);

  useEffect(() => {
    api.getGitHubOAuthStatus(projectId).then((res) => {
      setConnected(res.connected);
      setLogin(res.github_login);
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "github_oauth_complete") {
        api.getGitHubOAuthStatus(projectId).then((res) => {
          setConnected(res.connected);
          setLogin(res.github_login);
        }).catch(() => {});
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [projectId]);

  const connect = useCallback(async () => {
    try {
      const { authorize_url } = await api.getGitHubAuthUrl(projectId);
      sessionStorage.setItem("github_oauth_project_id", projectId);
      window.open(authorize_url, "github_oauth", "width=600,height=700");
    } catch {}
  }, [projectId]);

  if (connected === null) return null;

  return (
    <div className="flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      {connected ? (
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          GitHub: connected{login ? ` as @${login}` : ""}
        </span>
      ) : (
        <>
          <span className="text-xs text-neutral-500">GitHub: not connected</span>
          <Button size="sm" variant="outline" onClick={connect} className="ml-auto h-6 text-xs">
            Connect
          </Button>
        </>
      )}
    </div>
  );
}
