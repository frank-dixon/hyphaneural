/** Hyphaneural — Slow Ombre + Quiet Protomol tokens */
module.exports = {
  content: [
    "./docs/**/*.{html,js}",
    "./templates/**/*.html",
    "./static/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        void: "#07090b",
        "void-elev": "#0c1014",
        "void-panel": "rgba(8, 12, 18, 0.78)",
        violet: "#2a1848",
        indigo: "#1a2548",
        deepblue: "#0e2a4a",
        deepgreen: "#0a2e28",
        teal: {
          DEFAULT: "#3d9e8f",
          bright: "#5ec4b4",
          dim: "#1a4a44",
        },
        ember: {
          DEFAULT: "#c4784a",
          soft: "#a05a32",
        },
        mist: {
          DEFAULT: "#9aabb8",
          dim: "#5a6874",
        },
        ink: "#e4eaf0",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        brand: "0.32em",
        wide2: "0.18em",
        wide3: "0.22em",
      },
      animation: {
        "ombre-breathe": "ombre-breathe 18s ease-in-out infinite",
        "ombre-breathe-calm": "ombre-breathe 40s ease-in-out infinite",
        "panel-in": "panel-in 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)",
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
      },
      keyframes: {
        "ombre-breathe": {
          "0%, 100%": { opacity: "0.88", transform: "scale(1) translate3d(0,0,0)" },
          "50%": { opacity: "1", transform: "scale(1.03) translate3d(0.4%,-0.3%,0)" },
        },
        "panel-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "pulse-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.12)", opacity: "1" },
        },
      },
      transitionTimingFunction: {
        proto: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
