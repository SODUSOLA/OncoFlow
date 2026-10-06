import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Points at the monorepo root because node_modules is hoisted there and Turbopack can't resolve packages otherwise.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Proxies /api/* to the backend server-side so fetches stay same-origin, like the dashboard's Vite proxy.
  async rewrites() {
    const apiOrigin = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/:path*` },
      // Live notifications go through the same origin too, so the strict session cookie is sent. Rewrites carry
      // long-polling but not WebSocket upgrades, so deployed clients stay on polling.
      { source: "/socket.io/:path*", destination: `${apiOrigin}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
