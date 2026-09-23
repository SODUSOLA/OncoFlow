import type { MetadataRoute } from "next";

// start_url /home lands installed users in the app, since the patient layout's session check redirects logged-out users to login.
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
