// Prefix an app-absolute path ("/agntcy/logo.svg", "/articles", …) with the
// active basePath. Plain <img src> / <a href> attributes are NOT rewritten by
// Next when `basePath` is set (only next/link and next/image are), so the
// hardcoded "/agntcy/*" asset paths and the landing-page nav links would break
// once the marketing pages are served under the GitHub Pages "/agntcy/" prefix.
//
// NEXT_PUBLIC_BASE_PATH is surfaced by next.config.js: it is "" for normal
// Docker/dev builds (making this a no-op) and "/agntcy" for the static export.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
