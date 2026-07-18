import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // The photo jail's worker (src/lib/photo/photo-worker.mjs) is a plain .mjs
  // the server SPAWNS, never imports — so Next's file trace stages the worker
  // file and the GRACoL profile as assets (their process.cwd() joins are
  // statically analyzable) but never walks the worker's own `sharp` import.
  // Force sharp — plus its full runtime dep tree: the @img platform packages
  // (npm installs only the matching platform's) and its two leaf deps, which
  // Next's own trace stages INCOMPLETELY (just the subset next itself touches:
  // the staged `semver` lacked the index.js sharp's ESM import needs) — into
  // the standalone output so the deployed image can decode (plan §4 PE10a; the
  // docker CI lane proves the boot).
  outputFileTracingIncludes: {
    "/api/photo/**": [
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
      "./node_modules/semver/**",
      "./node_modules/detect-libc/**",
    ],
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
