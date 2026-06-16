"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ConfluencePageRef, WebexMeeting } from "@/lib/api";
import { ConfluenceSelector } from "@/components/ConfluenceSelector";
import { GitHubConnectStatus } from "@/components/GitHubConnectStatus";
import { WebexMeetingsSelector } from "@/components/WebexMeetingsSelector";

export function ReingestButton({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<WebexMeeting[]>([]);
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(new Set());
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const [confluencePages, setConfluencePages] = useState<Map<string, ConfluencePageRef>>(new Map());
  const [confluenceSessionKey, setConfluenceSessionKey] = useState<string | null>(null);

  function handleClose() {
    if (busy) return;
    setOpen(false);
    setSeed("");
    setSelectedMeetings(new Set());
    setMeetings([]);
    setConfluencePages(new Map());
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const selectedList = meetings
        .filter((m) => selectedMeetings.has(m.id))
        .map((m) => ({ id: m.id, title: m.title, start: m.start }));

      const confluenceList = Array.from(confluencePages.values());

      const connectorData: Record<string, unknown> = {};
      if (selectedList.length > 0) connectorData.webex = { meetings: selectedList };
      if (confluenceList.length > 0) connectorData.confluence = { pages: confluenceList };

      await api.reingest(projectId, {
        seed: seed.trim() || null,
        connector_data: Object.keys(connectorData).length > 0 ? connectorData : null,
      });
      mutate(`/api/projects/${projectId}`);
      mutate(`/api/projects/${projectId}/reports`);
      mutate(`/api/projects/${projectId}/ingests`);
      handleClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "ingest already in progress" : "Re-run the ingest pipeline"}
      >
        Reingest
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reingest project</DialogTitle>
            <DialogDescription>
              Run another ingest now. Optionally seed the agent with a one-shot
              instruction for this run — e.g. &ldquo;focus on the SSE leak&rdquo;
              or &ldquo;summarize the v1.0.7 cycle&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <label className="block">
              <div className="mb-1 text-sm font-medium">Seed instruction</div>
              <div className="mb-1.5 text-xs text-neutral-500">
                Optional. Goes to the agent alongside the standard ingest prompt.
                Doesn&apos;t override page-kind preservation rules.
              </div>
              <textarea
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="(blank = standard ingest)"
                rows={3}
                disabled={busy}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>

            {open && <GitHubConnectStatus projectId={projectId} />}

            {open && (
              <WebexMeetingsSelector
                projectId={projectId}
                disabled={busy}
                selectedMeetings={selectedMeetings}
                onSelectedChange={setSelectedMeetings}
                meetings={meetings}
                onMeetingsChange={setMeetings}
                sessionKey={sessionKey}
                onSessionKeyChange={setSessionKey}
              />
            )}

            {open && (
              <ConfluenceSelector
                projectId={projectId}
                disabled={busy}
                selectedPages={confluencePages}
                onSelectedChange={setConfluencePages}
                sessionKey={confluenceSessionKey}
                onSessionKeyChange={setConfluenceSessionKey}
              />
            )}
          </div>

          {error && (
            <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={busy}>
              {busy ? "Starting…" : "Run ingest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
