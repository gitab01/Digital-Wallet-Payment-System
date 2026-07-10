import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#e0eaff",
          200: "#c7d7fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        surface: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          800: "#1e293b",
          850: "#172033",
          900: "#0f172a",
          950: "#070d1a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        card:     "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
        "card-md":"0 4px 12px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.04)",
        "card-lg":"0 10px 30px rgba(0,0,0,.10), 0 4px 12px rgba(0,0,0,.05)",
        glow:     "0 0 24px rgba(99,102,241,.35)",
        "glow-sm":"0 0 12px rgba(99,102,241,.25)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)",
        "gradient-dark":  "linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
        "gradient-glass": "linear-gradient(135deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.02) 100%)",
      },
      animation: {
        "fade-in":    "fadeIn .22s ease-out",
        "slide-up":   "slideUp .25s ease-out",
        "slide-down": "slideDown .25s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(.4,0,.6,1) infinite",
        shimmer:      "shimmer 1.6s infinite linear",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideDown: { from: { opacity: "0", transform: "translateY(-10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer:   { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
