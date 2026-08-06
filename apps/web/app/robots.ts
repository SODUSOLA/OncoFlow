import type { MetadataRoute } from "next";

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
