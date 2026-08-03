import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        marker: ["'Permanent Marker'", "cursive"],
        sans: ["'Work Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        ink: "#33312E",
        cardboard: "#D4B896",
        "cardboard-dark": "#B3915F",
        chalk: "#FBF8F2",
        "chalk-dim": "#F1EADA",
        sun: "#F2C14E",
        marker: "#C63F3F",
        grass: "#5B8C5A",
        "grass-dark": "#436942",
        amber: "#C97D1F",
      },
      boxShadow: {
        tag: "0 6px 16px rgba(51,49,46,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
