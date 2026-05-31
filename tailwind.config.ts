import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Token bridge: CSS variables → Tailwind utilities
      // Allows both inline style={{…}} and className="text-accent bg-bg" approaches.
      colors: {
        bg:              "var(--bg)",
        "bg-elevated":   "var(--bg-elevated)",
        "bg-input":      "var(--bg-input)",
        "bg-tag":        "var(--bg-tag)",
        text:            "var(--text)",
        "text-secondary":"var(--text-secondary)",
        "text-muted":    "var(--text-muted)",
        "text-body":     "var(--text-body)",
        accent:          "var(--accent)",
        "accent-hover":  "var(--accent-hover)",
        success:         "var(--success)",
        "success-hover": "var(--success-hover)",
        border:          "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm:      "var(--radius-sm)",
      },
      fontFamily: {
        serif: ["var(--nd-serif)"],
        sans:  ["var(--nd-sans)"],
        mono:  ["var(--nd-mono)"],
      },
    },
  },
  plugins: [],
};
export default config;
