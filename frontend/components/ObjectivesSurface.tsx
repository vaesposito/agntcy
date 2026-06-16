"use client";

import { StableSurface, type SectionSpec } from "./StableSurface";

// Section contract for objectives.md — mirrors the founding template in backend
// reports/schema.py (_OBJECTIVES_BODY).
const OBJECTIVES_SECTIONS: SectionSpec[] = [
  {
    title: "North-star metric",
    prompt:
      "The single number that best captures progress — what it is, and why it's the one that matters.",
  },
  {
    title: "Objectives",
    prompt: "What you're driving toward, and how you'll measure it.",
  },
  {
    title: "How this ladders to Outshift OKRs",
    prompt: "Which org-level OKR(s) these advance, and how.",
  },
];

export function ObjectivesSurface(props: {
  projectId: string;
  version: number;
  locked: boolean;
}) {
  return (
    <StableSurface
      {...props}
      pagePath="objectives.md"
      title="Objectives"
      ariaLabel="Project objectives"
      sections={OBJECTIVES_SECTIONS}
    />
  );
}
