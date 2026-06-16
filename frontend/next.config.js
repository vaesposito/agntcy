/** @type {import('next').NextConfig} */
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
const resolvedBasePath = process.env.CAIPE_PROXY
  ? process.env.BASE_PATH || "/ttt"
  : "";

const nextConfig = {
  ...(process.env.CAIPE_PROXY && {
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
