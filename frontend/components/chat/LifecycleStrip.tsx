"use client";

import type { Turn } from "./useProjectChat";

/**
 * Single-line status for an assistant turn while it's in flight: a pulsing
 * dot plus the latest lifecycle stage, updated in place (container boot →
 * agent ready → asking the agent). Once the turn finishes the strip
 * disappears — the assistant's response stands on its own.
 */
export function LifecycleStrip({ turn }: { turn: Turn }) {
  const events = turn.lifecycle;
  if (events.length === 0) return null;
  if (turn.done || turn.error) return null;

  const last = events[events.length - 1];
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
      <span>{last.message}</span>
    </div>
  );
}
