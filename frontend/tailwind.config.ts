import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        fg: {
          DEFAULT: "var(--fg)",
          muted: "var(--fg-muted)",
          subtle: "var(--fg-subtle)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          contrast: "var(--accent-contrast)",
          subtle: "var(--accent-subtle)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          strong: "var(--secondary-strong)",
          subtle: "var(--secondary-subtle)",
        },
        pass: {
          fg: "var(--pass-fg)",
          bg: "var(--pass-bg)",
          border: "var(--pass-border)",
        },
        review: {
          fg: "var(--review-fg)",
          bg: "var(--review-bg)",
          border: "var(--review-border)",
        },
        fail: {
          fg: "var(--fail-fg)",
          bg: "var(--fail-bg)",
          border: "var(--fail-border)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "var(--shadow)",
        "card-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "float-a": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(4%,-6%,0) scale(1.08)" },
        },
        "float-b": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "50%": { transform: "translate3d(-5%,5%,0) scale(0.95)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
        "float-a": "float-a 14s ease-in-out infinite",
        "float-b": "float-b 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
