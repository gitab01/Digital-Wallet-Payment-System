import type { Config } from "tailwindcss";

/**
 * Design system for Digital Wallet.
 *
 * Rules that are deliberate and must not drift:
 *  - Surfaces are pure white (#ffffff) only. No gradients, no patterns, no glows,
 *    no tinted bands. Colour lives at component level (text, borders, rings).
 *  - Exactly one accent (green) carries "money positive" + interactive/verified
 *    signals; a single restrained red carries "money negative" + destructive.
 *  - Everything else is neutral ink/paper.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#000000",
          soft: "#171717",
          muted: "#525252",
          faint: "#737373",
        },
        line: {
          DEFAULT: "#E5E5E5",
          strong: "#000000",
        },
        accent: {
          DEFAULT: "#047857",
          dark: "#03634A",
        },
        debit: {
          DEFAULT: "#B42318",
          dark: "#8F1D14",
        },
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      fontSize: {
        // One restrained scale: 11 / 13 / 15 / 18 / 24 / 34
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        body: ["0.9375rem", { lineHeight: "1.5rem" }],
        title: ["1.125rem", { lineHeight: "1.625rem" }],
        h2: ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
        h1: ["2.125rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }],
      },
      maxWidth: {
        content: "72rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
