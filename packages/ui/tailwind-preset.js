/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        // OncoFlow's canonical clinical brand identity, per the OncoFlow Design System v2.0 spec
        // and the ONCOFLOW LIMITED logo — distinct from the dashboard's placeholder `brand` green.
        ink: {
          DEFAULT: "#173A5E",
          600: "#0F2A46",
        },
        gold: {
          DEFAULT: "#E9B21A",
        },
      },
    },
  },
};
