/** @type {import('next').NextConfig} */
//
// outputFileTracingRoot pins the workspace root to this frontend directory.
// Without it, Next infers the root from the nearest lockfile and can pick a
// stray lockfile higher up the tree (e.g. ~/package-lock.json), which breaks
// the dev client manifest and stops the global stylesheet from being served.
const path = require("path");
//
// When mounted behind a reverse proxy (e.g. CAIPE) set:
//   CAIPE_PROXY=1
//   BASE_PATH=/apps/ttt           (default: /ttt)
//
// With BASE_PATH set, Next prefixes both pages and `/_next/*` asset URLs
// automatically — no separate assetPrefix is needed. ASSET_PREFIX is still
// honored if explicitly provided (e.g. for CDN deploys).
//
// Without CAIPE_PROXY the app behaves exactly as standalone (root path).
// GITHUB_PAGES=true switches the build into a fully static export tailored
// for publishing the AGNTCY marketing pages at vaesposito.github.io/agntcy/.
// It is intentionally separate from the CAIPE_PROXY path: normal Docker/dev
// builds (plain `next build` / `next dev`) set neither env and are unchanged.
const isGithubPages = process.env.GITHUB_PAGES === "true";

const resolvedBasePath = isGithubPages
  ? "/agntcy"
  : process.env.CAIPE_PROXY
    ? process.env.BASE_PATH || "/ttt"
    : "";

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  ...(isGithubPages
    ? {
        output: "export",
        basePath: resolvedBasePath,
        assetPrefix: resolvedBasePath,
        images: { unoptimized: true },
        // Emit directory-style routes (agntcy/index.html) so GitHub Pages serves
        // clean URLs without per-file .html rewriting quirks.
        trailingSlash: true,
        // Use a dedicated dir so the export build never shares (and corrupts)
        // the default `.next` used by a running `next dev`. NOTE: with a custom
        // distDir, Next writes the static export INTO this directory (i.e.
        // `.next-pages/`, not `out/`); the deploy workflow uploads it as-is.
        distDir: ".next-pages",
      }
    : process.env.CAIPE_PROXY && {
        basePath: resolvedBasePath,
        ...(process.env.ASSET_PREFIX ? { assetPrefix: process.env.ASSET_PREFIX } : {}),
      }),
  // Surface basePath into the client bundle so plain `fetch("/api/...")`
  // helpers can prefix correctly even at SSR time. (Next does NOT include
  // basePath in plain fetch URLs; it only rewrites <Link>/router navigation.)
  env: {
    NEXT_PUBLIC_BASE_PATH: resolvedBasePath,
  },
};

module.exports = nextConfig;
