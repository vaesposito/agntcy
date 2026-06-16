"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function WebexOAuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <WebexOAuthCallbackInner />
    </Suspense>
  );
}

function WebexOAuthCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(true);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError("Missing code or state parameter from Webex");
      setExchanging(false);
      return;
    }

    const projectId = sessionStorage.getItem("webex_oauth_project_id");
    const sessionKey = sessionStorage.getItem("webex_oauth_session_key");

    if (!projectId && !sessionKey) {
      setError("Missing context. Please retry the authorization.");
      setExchanging(false);
      return;
    }

    const exchange = projectId
      ? api.exchangeWebexCode(projectId, { code, state })
      : api.exchangeWebexCodeGlobal({ code, state, session_key: sessionKey! });

    exchange
      .then(() => {
        sessionStorage.removeItem("webex_oauth_project_id");
        sessionStorage.removeItem("webex_oauth_session_key");
        if (window.opener) {
          window.opener.postMessage(
            { type: "webex_oauth_complete" },
            window.location.origin,
          );
          window.close();
        } else if (projectId) {
          router.push(`/projects/${projectId}`);
        } else {
          router.push("/projects/new");
        }
      })
      .catch((err) => {
        setError(err.message || "Token exchange failed");
        setExchanging(false);
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">
            Authorization Failed
          </h2>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (exchanging) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Completing Webex authorization...
        </p>
      </div>
    );
  }

  return null;
}
