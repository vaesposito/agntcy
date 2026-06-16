"use client";

import { StableSurface, type SectionSpec } from "./StableSurface";

// Section contract for roadmap.md — mirrors the founding template in backend
// reports/schema.py (_ROADMAP_BODY).
const ROADMAP_SECTIONS: SectionSpec[] = [
  { title: "Now", prompt: "What you're actively building this horizon." },
  {
    title: "Next",
    prompt: "Near-term bets, roughly in priority order. Themes, not dates.",
  },
  {
    title: "Later",
    prompt: "Directions you believe in but aren't committing to yet.",
  },
  {
    title: "Explicitly deprioritized",
    prompt: "What you chose not to do — and what would make you revisit.",
  },
];

export function RoadmapSurface(props: {
  projectId: string;
  version: number;
  locked: boolean;
}) {
  return (
    <StableSurface
      {...props}
      pagePath="roadmap.md"
      title="Roadmap"
      ariaLabel="Project roadmap"
      sections={ROADMAP_SECTIONS}
    />
  );
}
