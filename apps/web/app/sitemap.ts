import type { MetadataRoute } from "next";

const baseUrl = "https://oncoflow.health";

const routes = [
  "",
  "/about",
  "/solutions",
  "/features",
  "/resources",
  "/contact",
  "/careers",
  "/privacy",
  "/terms",
  "/cookies",
  "/login",
  "/register",
  "/forgot-password",
];

// Generates the sitemap from the marketing routes.
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.6,
  }));
}
