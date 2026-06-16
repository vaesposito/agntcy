import { NextResponse } from "next/server";

// A constant liveness probe — safe to pre-render so it also survives the
// static `output: 'export'` build used for GitHub Pages.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
