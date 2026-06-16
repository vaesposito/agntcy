"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, type PageKind } from "@/lib/api";
import { KindBadge } from "./KindBadge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function KindToggleButton({
  projectId,
  version,
  pagePath,
  currentKind,
  disabled,
  onChanged,
}: {
  projectId: string;
  version: number;
  pagePath: string;
  currentKind: PageKind;
  disabled: boolean;
  onChanged: () => void;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // "report" is system-managed via path; only stable/dynamic/hidden are
  // user-flippable kinds.
  const opts: { key: PageKind; label: string }[] = [
    { key: "stable", label: "Stable" },
    { key: "dynamic", label: "Dynamic" },
    { key: "hidden", label: "Hidden" },
  ];

  async function set(kind: PageKind) {
    if (kind === currentKind) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api.patchFrontmatter(projectId, version, pagePath, { kind });
      onChanged();
      // Invalidate the page tree so the sidebar badge updates immediately.
      globalMutate(`/api/projects/${projectId}/reports/${version}`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          title="Change page kind"
          className="capitalize"
        >
          {currentKind}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="mb-2 px-1 text-[11px] uppercase tracking-wider text-neutral-500">
          Change kind
        </p>
        <div className="grid gap-1">
          {opts.map((o) => (
            <button
              key={o.key}
              onClick={() => set(o.key)}
              disabled={busy}
              className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800 ${
                o.key === currentKind ? "bg-neutral-100 dark:bg-neutral-800" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <KindBadge kind={o.key} iconOnly />
                <span>{o.label}</span>
              </span>
              {o.key === currentKind && (
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  current
                </span>
              )}
            </button>
          ))}
        </div>
        {currentKind === "report" && (
          <p className="mt-2 border-t border-neutral-200 px-1 pt-2 text-[11px] text-neutral-500 dark:border-neutral-800">
            Report pages are system-managed surfaces. Switching kind here will
            move it into the wiki tree.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
