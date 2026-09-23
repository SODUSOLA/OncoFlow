import type { MetadataRoute } from "next";

// Generates robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/reset-password", "/verify-email"],
    },
    sitemap: "https://oncoflow.health/sitemap.xml",
  };
}
