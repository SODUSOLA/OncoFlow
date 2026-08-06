import type { MetadataRoute } from "next";

// start_url: "/home" is what makes "installed to home screen -> opens straight into the app"
// work on Android/Chrome — the (patient) route group's layout already does a server-side
// session check (lib/session.ts) and bounces to /login if there's no valid session, so this
// single entry point correctly lands a logged-in patient in the app and a logged-out one at
// login, without the manifest needing to know which.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OncoFlow — Patient Portal",
    short_name: "OncoFlow",
    description: "Manage your cancer care journey — wallet, invoices, messages, and more.",
    start_url: "/home",
    display: "standalone",
    background_color: "#faf9f5",
    theme_color: "#002147",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
