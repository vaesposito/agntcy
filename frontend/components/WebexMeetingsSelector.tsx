"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, WebexMeeting } from "@/lib/api";

type Props = {
  projectId?: string;
  disabled?: boolean;
  selectedMeetings: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  meetings: WebexMeeting[];
  onMeetingsChange: (meetings: WebexMeeting[]) => void;
  sessionKey: string | null;
  onSessionKeyChange: (key: string | null) => void;
};

export function WebexMeetingsSelector({
  projectId,
  disabled,
  selectedMeetings,
  onSelectedChange,
  meetings,
  onMeetingsChange,
  sessionKey,
  onSessionKeyChange,
}: Props) {
  const [webexConnected, setWebexConnected] = useState<boolean | null>(null);
  const [webexLoading, setWebexLoading] = useState(false);
  const [meetingsLoading, setMeetingsLoading] = useState(false);

  useEffect(() => {
    setWebexLoading(true);
    if (projectId) {
      api
        .getWebexOAuthStatus(projectId)
        .then((status) => {
          setWebexConnected(status.connected);
          if (status.connected) {
            loadMeetings();
          }
        })
        .catch(() => setWebexConnected(false))
        .finally(() => setWebexLoading(false));
    } else {
      api
        .getGlobalWebexStatus()
        .then((status) => {
          setWebexConnected(status.connected);
          if (status.connected) {
            loadMeetings();
          }
        })
        .catch(() => setWebexConnected(false))
        .finally(() => setWebexLoading(false));
    }
  }, [projectId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "webex_oauth_complete") {
        setWebexConnected(true);
        loadMeetings();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [projectId, sessionKey]);

  function loadMeetings() {
    setMeetingsLoading(true);
    const promise = projectId
      ? api.listWebexMeetings(projectId)
      : api.listWebexMeetingsGlobal(sessionKey ?? undefined);
    promise
      .then(onMeetingsChange)
      .catch(() => onMeetingsChange([]))
      .finally(() => setMeetingsLoading(false));
  }

  async function connectWebex() {
    try {
      if (projectId) {
        const { authorize_url } = await api.getWebexAuthUrl(projectId);
        sessionStorage.setItem("webex_oauth_project_id", projectId);
        window.open(authorize_url, "webex_oauth", "width=600,height=700");
      } else {
        const { authorize_url, session_key } = await api.getGlobalWebexAuthUrl();
        onSessionKeyChange(session_key);
        sessionStorage.setItem("webex_oauth_session_key", session_key);
        window.open(authorize_url, "webex_oauth", "width=600,height=700");
      }
    } catch {
      // Silently fail — error will surface via the OAuth popup
    }
  }

  function toggleMeeting(id: string) {
    const next = new Set(selectedMeetings);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  function toggleAll() {
    if (selectedMeetings.size === meetings.length) {
      onSelectedChange(new Set());
    } else {
      onSelectedChange(new Set(meetings.map((m) => m.id)));
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <div className="mb-1 text-sm font-medium">Webex Meetings</div>
      <div className="mb-1.5 text-xs text-neutral-500">
        Optional. Select meetings to ingest transcripts and summaries.
      </div>

      {webexLoading && (
        <p className="text-xs text-neutral-500">Checking Webex connection...</p>
      )}

      {!webexLoading && webexConnected === false && (
        <Button size="sm" variant="outline" onClick={connectWebex} disabled={disabled}>
          Connect Webex
        </Button>
      )}

      {!webexLoading && webexConnected && meetingsLoading && (
        <p className="text-xs text-neutral-500">Loading meetings...</p>
      )}

      {!webexLoading && webexConnected && !meetingsLoading && meetings.length === 0 && (
        <p className="text-xs text-neutral-500">No meetings found in the last 30 days.</p>
      )}

      {!webexLoading && webexConnected && !meetingsLoading && meetings.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700">
          <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedMeetings.size === meetings.length}
                onChange={toggleAll}
                disabled={disabled}
                className="rounded"
              />
              {selectedMeetings.size === meetings.length ? "Deselect all" : "Select all"}
            </label>
          </div>
          {meetings.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <input
                type="checkbox"
                checked={selectedMeetings.has(m.id)}
                onChange={() => toggleMeeting(m.id)}
                disabled={disabled}
                className="rounded"
              />
              <span className="flex-1 truncate font-medium">{m.title}</span>
              {m.hasTranscription && (
                <span title="Transcript available">
                  <TranscriptIcon />
                </span>
              )}
              {m.hasSummary && (
                <span title="Summary available">
                  <SummaryIcon />
                </span>
              )}
              <span className="shrink-0 text-neutral-500">
                {formatDate(m.start)}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 5.75H27C27.1989 5.75 27.3897 5.67098 27.5303 5.53033C27.671 5.38968 27.75 5.19891 27.75 5C27.75 4.80109 27.671 4.61032 27.5303 4.46967C27.3897 4.32902 27.1989 4.25 27 4.25H5C4.80109 4.25 4.61032 4.32902 4.46967 4.46967C4.32902 4.61032 4.25 4.80109 4.25 5C4.25 5.19891 4.32902 5.38968 4.46967 5.53033C4.61032 5.67098 4.80109 5.75 5 5.75Z" fill="url(#paint0_transcript)" />
      <path d="M27 11.25H5C4.80109 11.25 4.61032 11.329 4.46967 11.4697C4.32902 11.6103 4.25 11.8011 4.25 12C4.25 12.1989 4.32902 12.3897 4.46967 12.5303C4.61032 12.671 4.80109 12.75 5 12.75H27C27.1989 12.75 27.3897 12.671 27.5303 12.5303C27.671 12.3897 27.75 12.1989 27.75 12C27.75 11.8011 27.671 11.6103 27.5303 11.4697C27.3897 11.329 27.1989 11.25 27 11.25Z" fill="url(#paint0_transcript)" />
      <path d="M27 18.25H5C4.80109 18.25 4.61032 18.329 4.46967 18.4697C4.32902 18.6103 4.25 18.8011 4.25 19C4.25 19.1989 4.32902 19.3897 4.46967 19.5303C4.61032 19.671 4.80109 19.75 5 19.75H27C27.1989 19.75 27.3897 19.671 27.5303 19.5303C27.671 19.3897 27.75 19.1989 27.75 19C27.75 18.8011 27.671 18.6103 27.5303 18.4697C27.3897 18.329 27.1989 18.25 27 18.25Z" fill="url(#paint0_transcript)" />
      <path d="M13 25.25H5C4.80109 25.25 4.61032 25.329 4.46967 25.4697C4.32902 25.6103 4.25 25.8011 4.25 26C4.25 26.1989 4.32902 26.3897 4.46967 26.5303C4.61032 26.671 4.80109 26.75 5 26.75H13C13.1989 26.75 13.3897 26.671 13.5303 26.5303C13.671 26.3897 13.75 26.1989 13.75 26C13.75 25.8011 13.671 25.6103 13.5303 25.4697C13.3897 25.329 13.1989 25.25 13 25.25Z" fill="url(#paint0_transcript)" />
      <defs>
        <linearGradient id="paint0_transcript" x1="27.753" y1="35.5441" x2="52.2537" y2="-12.9598" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0051AF" />
          <stop offset="0.515625" stopColor="#00BCEB" />
          <stop offset="1" stopColor="#63FFF7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24.7408 1.88303C24.6833 1.51849 24.3691 1.25 24 1.25C23.6309 1.25 23.3167 1.51849 23.2592 1.88303C23.0548 3.17743 22.8745 4.09794 22.6554 4.77875C22.4395 5.44937 22.2042 5.82762 21.925 6.0835C21.6418 6.34315 21.2441 6.54091 20.5803 6.72265C19.9534 6.89432 19.1652 7.03316 18.1098 7.21908L17.8697 7.26141C17.5113 7.32466 17.25 7.63607 17.25 8C17.25 8.36393 17.5113 8.67534 17.8697 8.73859L18.1098 8.78092C19.1652 8.96684 19.9534 9.10568 20.5803 9.27735C21.2441 9.45909 21.6418 9.65685 21.925 9.9165C22.2042 10.1724 22.4395 10.5506 22.6554 11.2212C22.8745 11.9021 23.0548 12.8226 23.2592 14.117C23.3167 14.4815 23.6309 14.75 24 14.75C24.3691 14.75 24.6833 14.4815 24.7408 14.117C24.9452 12.8226 25.1255 11.9021 25.3446 11.2212C25.5605 10.5506 25.7958 10.1724 26.075 9.9165C26.3582 9.65685 26.7559 9.45909 27.4197 9.27735C28.0466 9.10569 28.8348 8.96684 29.8902 8.78092L30.1303 8.73859C30.4887 8.67534 30.75 8.36393 30.75 8C30.75 7.63607 30.4887 7.32466 30.1303 7.26141L29.8902 7.21909C28.8348 7.03317 28.0466 6.89431 27.4197 6.72265C26.7559 6.54091 26.3582 6.34315 26.075 6.0835C25.7958 5.82762 25.5605 5.44937 25.3446 4.77875C25.1255 4.09794 24.9452 3.17743 24.7408 1.88303ZM22.9386 8.81077C22.5349 8.44074 22.0605 8.19077 21.5219 8C22.0605 7.80923 22.5349 7.55926 22.9386 7.18923C23.4223 6.74584 23.7491 6.18137 24 5.48318C24.2509 6.18137 24.5777 6.74584 25.0614 7.18923C25.4651 7.55926 25.9395 7.80923 26.4781 8C25.9395 8.19077 25.4651 8.44074 25.0614 8.81077C24.5777 9.25416 24.2509 9.81864 24 10.5168C23.7491 9.81864 23.4223 9.25416 22.9386 8.81077ZM9 5.75C7.20507 5.75 5.75 7.20507 5.75 9V23C5.75 24.7949 7.20507 26.25 9 26.25H23C24.7949 26.25 26.25 24.7949 26.25 23V16C26.25 15.5858 26.5858 15.25 27 15.25C27.4142 15.25 27.75 15.5858 27.75 16V23C27.75 25.6234 25.6234 27.75 23 27.75H9C6.37665 27.75 4.25 25.6234 4.25 23V9C4.25 6.37665 6.37665 4.25 9 4.25H16C16.4142 4.25 16.75 4.58579 16.75 5C16.75 5.41421 16.4142 5.75 16 5.75H9ZM9.25 10C9.25 9.58579 9.58579 9.25 10 9.25H16C16.4142 9.25 16.75 9.58579 16.75 10C16.75 10.4142 16.4142 10.75 16 10.75H10C9.58579 10.75 9.25 10.4142 9.25 10ZM10 14.25C9.58579 14.25 9.25 14.5858 9.25 15C9.25 15.4142 9.58579 15.75 10 15.75H21C21.4142 15.75 21.75 15.4142 21.75 15C21.75 14.5858 21.4142 14.25 21 14.25H10ZM9.25 20C9.25 19.5858 9.58579 19.25 10 19.25H15C15.4142 19.25 15.75 19.5858 15.75 20C15.75 20.4142 15.4142 20.75 15 20.75H10C9.58579 20.75 9.25 20.4142 9.25 20Z"
        fill="url(#paint0_summary)"
      />
      <defs>
        <linearGradient id="paint0_summary" x1="27.753" y1="35.5441" x2="52.2537" y2="-12.9598" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0051AF" />
          <stop offset="0.515625" stopColor="#00BCEB" />
          <stop offset="1" stopColor="#63FFF7" />
        </linearGradient>
      </defs>
    </svg>
  );
}
