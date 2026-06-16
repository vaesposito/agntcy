"use client";

import { StableSurface, type SectionSpec } from "./StableSurface";

// Section contract for charter.md — mirrors the founding template in backend
// reports/schema.py (_CHARTER_BODY).
const CHARTER_SECTIONS: SectionSpec[] = [
  {
    title: "What we're building",
    prompt: "One or two sentences: what this is, and who it's for.",
  },
  { title: "Why it matters", prompt: "Why this is worth doing — and why now." },
  {
    title: "What success looks like",
    prompt: "The concrete outcome that means we won.",
  },
  {
    title: "Out of scope",
    prompt:
      "What you're deliberately NOT building. Prevents drift and wrong assumptions.",
  },
  {
    title: "Confidence on key bets",
    prompt:
      "The beliefs this effort rests on, and how sure you are of each (hypothesis / testing / validated / committed).",
  },
];

export function CharterSurface(props: {
  projectId: string;
  version: number;
  locked: boolean;
}) {
  return (
    <StableSurface
      {...props}
      pagePath="charter.md"
      title="Charter"
      ariaLabel="Project charter"
      sections={CHARTER_SECTIONS}
    />
  );
}
