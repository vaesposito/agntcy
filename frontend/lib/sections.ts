// Markdown <-> section helpers for the structured stable-page surfaces
// (CharterSurface and friends). Sections split on top-level `## ` headers.
//
// Two rules the StandupCard impl got wrong and we don't:
//   1. Off-schema sections are PRESERVED, never dropped — the markdown stays a
//      superset of whatever any one surface knows how to render.
//   2. Frontmatter is preserved across a body round-trip (see frontmatterBlock).

export type Section = { title: string; body: string };

export function parseSections(body: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const raw of body.split("\n")) {
    const m = raw.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (cur) out.push({ title: cur.title, body: cur.body.replace(/\n+$/, "") });
      cur = { title: m[1].trim(), body: "" };
      continue;
    }
    if (cur) cur.body += raw + "\n";
  }
  if (cur) out.push({ title: cur.title, body: cur.body.replace(/\n+$/, "") });
  return out;
}

export function serializeSections(sections: Section[]): string {
  return (
    sections
      .map((s) => `## ${s.title}\n\n${s.body.trim()}`)
      .join("\n\n") + "\n"
  );
}

// A section is "unfilled" if, once the founding scaffolding is stripped, no
// real content remains: blank lines, the italic prompt (`_..._`), lone `-`
// bullets, and empty markdown table rows / separators all count as scaffolding.
export function isUnfilled(body: string): boolean {
  const meaningful = body
    .split("\n")
    .map((l) => l.trim())
    .filter((s) => {
      if (!s) return false;
      if (s === "-") return false; // empty bullet
      if (/^_.*_$/.test(s)) return false; // italic prompt line
      if (/^\|[\s:|-]*\|?$/.test(s)) return false; // table separator row
      if (/^\|(\s*\|)+$/.test(s)) return false; // table row with all-empty cells
      return true;
    });
  // A table header alone (e.g. `| Bet | Confidence | Evidence |`) is scaffolding
  // too — treat a lone header row with no data rows as unfilled.
  if (meaningful.length === 1 && meaningful[0].startsWith("|")) return true;
  return meaningful.length === 0;
}

// The literal frontmatter block (`---\n...\n---\n`) from full page markdown, so
// a body-only re-serialize can re-attach it unchanged. "" when none present.
export function frontmatterBlock(fullMarkdown: string): string {
  if (!fullMarkdown.startsWith("---\n")) return "";
  const end = fullMarkdown.indexOf("\n---\n", 4);
  if (end === -1) return "";
  return fullMarkdown.slice(0, end + 5); // include the closing `---\n`
}
