import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          950: "#0A0A0A",
          900: "#0E0E0E",
          800: "#1A1A1A",
          700: "#242424",
          600: "#2A2A2A",
          500: "#3D3D3D",
          400: "#6B6B6B",
          200: "#A1A1A1",
          50: "#FFFFFF",
        },
        crimson: {
          900: "#2D0A0A",
          800: "#5C1111",
          700: "#7A1515",
          600: "#9B1C1C",
          500: "#B91C1C",
          400: "#DC2626",
          300: "#EF4444",
          200: "#FECACA",
          100: "#FEE2E2",
        },
        "text-body": "#A1A1A1",
        "text-muted": "#6B6B6B",
        border: "rgba(255, 255, 255, 0.08)",
        "border-strong": "rgba(255, 255, 255, 0.14)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
