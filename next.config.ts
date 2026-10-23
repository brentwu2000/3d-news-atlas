import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// `npm run build:static` produces a fully static site in out/ (deployed to Cloudflare Pages).
// Plain `next build` stays a normal server build so `next start` and the E2E suite keep working.
const staticExport = process.env.npm_lifecycle_event === "build:static";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  poweredByHeader: false,
  // A stray lockfile in the user's home directory confuses workspace-root detection.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
