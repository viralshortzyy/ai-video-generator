import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#0B0B0F",
          panel: "#121218",
          panel2: "#17171F",
          line: "#26262F",
          amber: "#F5A524",
          ember: "#FF6B35",
          cream: "#F5F1E8",
          mute: "#9A9AA5",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(245, 165, 36, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
