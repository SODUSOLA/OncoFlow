import uiPreset from "@oncoflow/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  presets: [uiPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  plugins: [require("tailwindcss-animate")],
};