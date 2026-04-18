import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy brand — retained until all pages migrate to design tokens.
        brand: {
          DEFAULT: "#0f766e",
          fg: "#f0fdfa",
        },
        // Design tokens — mirror globals.css CSS variables so classes like
        // `bg-surface-card`, `text-ink-muted`, `border-hairline-subtle`
        // resolve to the same values as the raw variables.
        surface: {
          base: "var(--bg-primary)",
          card: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          subtle: "var(--bg-subtle)",
        },
        ink: {
          DEFAULT: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          muted: "var(--text-muted)",
        },
        state: {
          verified: "var(--verified)",
          "verified-bg": "var(--verified-bg)",
          pending: "var(--pending)",
          "pending-bg": "var(--pending-bg)",
          flagged: "var(--flagged)",
          "flagged-bg": "var(--flagged-bg)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
        },
        accent: {
          DEFAULT: "var(--accent)",
        },
        hairline: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
      },
      fontSize: {
        // Spec typography scale. Never use more than 3 sizes/screen.
        display: ["clamp(40px, 5vw, 60px)", { lineHeight: "1.05", fontWeight: "700", letterSpacing: "-0.02em" }],
        "heading-1": ["32px", { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.01em" }],
        "heading-2": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "1.45", fontWeight: "500" }],
        micro: ["11px", { lineHeight: "1.4", fontWeight: "600", letterSpacing: "0.04em" }],
      },
      transitionDuration: {
        fast: "100ms",
        base: "150ms",
        slow: "200ms",
        page: "300ms",
      },
    },
  },
  plugins: [],
};

export default config;
