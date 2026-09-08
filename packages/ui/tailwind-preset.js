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
        // The locked design system's own palette ("Palette A" in ONCOFLOW_DESIGN_SYSTEM.md),
        // pulled directly from Figma. Kept separate from `ink`/`gold` above rather than
        // repointing them, since those are the app-wide brand tokens already used on Login and
        // the Patient views — this palette is specific to the screens re-specced against that
        // doc. Originally scoped to Regional Admin (hence the `admin` name), now shared as-is
        // by Consulting Oncologist too — same Palette A, same values, per the design system's
        // "Consulting Oncologist persona — token reconciliation" section. Not renamed to avoid
        // a disruptive find/replace across every already-shipped Regional Admin page; treat
        // `admin-*` as "the locked design system's tokens," not "admin-only."
        admin: {
          "sidebar-cta": "#002147",
          gold: "#FED65B",
          "gold-text": "#745C00",
          border: "#C4C6CF",
          text: "#000A1E",
          "text-secondary": "#44474E",
          disabled: "#E3E2E6",
          "disabled-alt": "#E9E7EB",
          danger: "#C92A2A",
          "danger-text": "#93000A",
          warning: "#E67E22",
          success: "#2D6A4F",
          "page-bg": "#FAF9FD",
          "canvas-bg": "#F8F9FA",
          card: "#FFFFFF",
          "card-alt": "#F4F3F7",
          // Added for Consulting Oncologist: patient-ID-badge accent and the dim label color
          // used on dark, video-room-only surfaces (the Video Consult Room's bottom HUD bar).
          "info-bg": "#D6E3FF",
          "info-text": "#001B3D",
          "dark-label": "#708AB5",
        },
      },
      fontFamily: {
        "public-sans": ['"Public Sans"', "system-ui", "sans-serif"],
      },
      fontSize: {
        "admin-h1": ["32px", { lineHeight: "40px", letterSpacing: "-0.64px", fontWeight: "700" }],
        "admin-h2": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "admin-h3": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "admin-h4": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        "admin-body": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "admin-body-sm": ["14px", { lineHeight: "20px" }],
        "admin-caption": ["12px", { lineHeight: "16px" }],
        "admin-micro": ["10px", { lineHeight: "20px" }],
      },
      borderRadius: {
        "admin-xs": "2px",
        "admin-sm": "4px",
        "admin-md": "8px",
        "admin-lg": "12px",
      },
      boxShadow: {
        "admin-card": "0px 1px 2px rgba(0,0,0,0.05)",
        "admin-warning": "0px 2px 8px rgba(230,126,34,0.15)",
      },
    },
  },
};
