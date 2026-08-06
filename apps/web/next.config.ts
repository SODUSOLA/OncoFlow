import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Points at the npm-workspaces monorepo root, not this app's own directory — node_modules
  // (including next itself) is hoisted there, and Turbopack can't resolve packages otherwise.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Proxies /api/* to the backend server-side, same pattern apps/dashboard uses via Vite's
  // dev proxy — keeps the browser's fetches same-origin (no CORS config to keep in sync) and
  // the session cookie scoped consistently regardless of which app issued it.
  async rewrites() {
    const apiOrigin = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
