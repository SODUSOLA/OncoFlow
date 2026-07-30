import uiPreset from "@oncoflow/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [uiPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
