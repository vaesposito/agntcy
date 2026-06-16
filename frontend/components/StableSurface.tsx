"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api, swrFetcher, type PageKind, type PageResponse } from "@/lib/api";
import {
  frontmatterBlock,
  isUnfilled,
  parseSections,
  serializeSections,
  type Section,
} from "@/lib/sections";
import { CrepeEditor, type CrepeEditorHandle } from "./CrepeEditor";
import { HistoryPanel } from "./HistoryPanel";
import { KindBadge } from "./KindBadge";
import { KindToggleButton } from "./KindToggleButton";
import { Button } from "@/components/ui/button";

// One section's contract: its `##` heading and the prompt shown as an
// "answer this" card when it's unfilled. Each stable-page surface owns its own
// list (see CharterSurface / ObjectivesSurface / RoadmapSurface) — this is a
// per-page React component composing a shared layout, not a config engine.
export type SectionSpec = { title: string; prompt: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Renders a stable page (charter / objectives / roadmap) as structured section
 * cards: filled sections render rich + edit per-section; unfilled ones render
 * as interview cards. Round-trips markdown, preserving the frontmatter block
 * (so `kind: stable` survives) and any off-contract sections.
 */
export function StableSurface({
  projectId,
  version,
  locked,
  pagePath,
  title,
  ariaLabel,
  sections,
}: {
  projectId: string;
  version: number;
  locked: boolean;
  pagePath: string;
  title: string;
  ariaLabel: string;
  sections: SectionSpec[];
}) {
  const pageKey = `/api/projects/${projectId}/reports/${version}/pages/${pagePath}`;
  const { data, error, isLoading, mutate } = useSWR<PageResponse>(
    pageKey,
    swrFetcher,
    { shouldRetryOnError: false },
  );

  const [showHistory, setShowHistory] = useState(false);
  const pageKind = (data?.frontmatter?.kind as PageKind) ?? "stable";

  const parsed = useMemo(() => parseSections(data?.body ?? ""), [data?.body]);
  const bodyByTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of parsed) m.set(norm(s.title), s.body);
    return m;
  }, [parsed]);

  // Off-contract sections the agent or a human added — preserved, rendered
  // after the known set, never dropped on save.
  const extraSections = useMemo(
    () =>
      parsed.filter((s) => !sections.some((c) => norm(c.title) === norm(s.title))),
    [parsed, sections],
  );

  const notGenerated = error && (error as Error).message.startsWith("404");

  function shell(children: React.ReactNode, controls?: React.ReactNode) {
    return (
      <Shell title={title} ariaLabel={ariaLabel} kind={pageKind} controls={controls}>
        {children}
      </Shell>
    );
  }

  // Re-serialize the whole page from current state, applying one edited
  // section. Known sections in contract order, then preserved extras, with the
  // original frontmatter block re-attached so `kind: stable` survives.
  async function saveSection(sectionTitle: string, newBody: string) {
    const known: Section[] = sections.map((c) => ({
      title: c.title,
      body:
        norm(c.title) === norm(sectionTitle)
          ? newBody
          : (bodyByTitle.get(norm(c.title)) ?? ""),
    }));
    const md =
      frontmatterBlock(data?.markdown ?? "") +
      serializeSections([...known, ...extraSections]);
    await api.putPage(projectId, version, pagePath, md);
    await mutate();
  }

  if (isLoading) return shell(`Loading ${title.toLowerCase()}…`);
  if (notGenerated) {
    return shell(
      <p className="text-sm text-neutral-500">
        No {title.toLowerCase()} yet — run a reingest to scaffold it.
      </p>,
    );
  }
  if (error) {
    return shell(
      <p className="text-sm text-red-700 dark:text-red-300">
        {(error as Error).message}
      </p>,
    );
  }
  if (!data) return null;

  const controls = (
    <>
      <KindToggleButton
        projectId={projectId}
        version={version}
        pagePath={pagePath}
        currentKind={pageKind}
        disabled={locked}
        onChanged={() => mutate()}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowHistory(true)}
        title="View revision history"
      >
        History
      </Button>
    </>
  );

  return shell(
    <>
      <div className="flex flex-col gap-3">
        {sections.map((c) => (
          <SectionCard
            key={c.title}
            title={c.title}
            prompt={c.prompt}
            body={bodyByTitle.get(norm(c.title)) ?? ""}
            revisionId={data.revision_id ?? "none"}
            locked={locked}
            onSave={(newBody) => saveSection(c.title, newBody)}
          />
        ))}

        {extraSections.length > 0 && (
          <div className="mt-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-neutral-400">
              Additional sections
            </p>
            <div className="flex flex-col gap-3">
              {extraSections.map((s) => (
                <SectionCard
                  key={s.title}
                  title={s.title}
                  prompt=""
                  body={s.body}
                  revisionId={data.revision_id ?? "none"}
                  locked={locked}
                  onSave={(newBody) => saveSection(s.title, newBody)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showHistory && (
        <HistoryPanel
          projectId={projectId}
          pagePath={pagePath}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>,
    controls,
  );
}

function Shell({
  title,
  ariaLabel,
  kind = "stable",
  controls,
  children,
}: {
  title: string;
  ariaLabel: string;
  kind?: PageKind;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={ariaLabel}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <KindBadge kind={kind} />
        </div>
        {controls && <div className="flex gap-2">{controls}</div>}
      </div>
      {children}
    </section>
  );
}

function SectionCard({
  title,
  prompt,
  body,
  revisionId,
  locked,
  onSave,
}: {
  title: string;
  prompt: string;
  body: string;
  revisionId: string;
  locked: boolean;
  onSave: (newBody: string) => Promise<void>;
}) {
  const editorRef = useRef<CrepeEditorHandle>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const unfilled = isUnfilled(body);

  async function save() {
    if (!editorRef.current) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(editorRef.current.getMarkdown());
      setEditing(false);
      setEpoch((n) => n + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Unfilled + not editing -> the "interview card": show the question, invite
  // an answer. This is the empty-state pattern, not a blank editor.
  if (unfilled && !editing) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-sm font-semibold tracking-tight text-neutral-700 dark:text-neutral-300">
              {title}
            </h3>
            {prompt && <p className="mt-0.5 text-sm text-neutral-500">{prompt}</p>}
          </div>
          {!locked && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Answer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group rounded-lg border bg-white transition-shadow dark:bg-neutral-900 ${
        editing
          ? "border-amber-300 ring-2 ring-amber-200 dark:border-amber-700 dark:ring-amber-900/40"
          : "border-neutral-200 hover:shadow-sm dark:border-neutral-800"
      }`}
    >
      <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
        <h3 className="font-serif text-sm font-semibold tracking-tight">{title}</h3>
        {!editing && !locked && (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] uppercase tracking-wide text-neutral-400 opacity-0 hover:text-neutral-700 group-hover:opacity-100 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            edit
          </button>
        )}
      </div>

      <div className="px-2 pb-1">
        <CrepeEditor
          ref={editorRef}
          key={`${title}-${revisionId}-${epoch}`}
          initialMarkdown={editing ? body || `_${prompt}_` : body || "_(empty)_"}
          readonly={!editing}
        />
      </div>

      {err && (
        <p className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">{err}</p>
      )}

      {editing && (
        <div className="flex justify-end gap-2 border-t border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setEpoch((n) => n + 1);
              setErr(null);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || locked}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
