/** Hyphaneural — cream chrome + Slow Ombre craft tokens */
module.exports = {
  content: [
    "./docs/**/*.{html,js}",
    "./src/js/**/*.js",
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
        paper: {
          DEFAULT: "#F3EEE4",
          soft: "#F8F3EA",
          2: "#E8E0D2",
        },
        ink: {
          DEFAULT: "#1C1916",
          soft: "#3F3A35",
          muted: "#6A635B",
        },
        rule: {
          DEFAULT: "#D4CBBE",
          soft: "#E4DCD0",
        },
        teal: {
          DEFAULT: "#0B8A8F",
          bright: "#0B8A8F",
          deep: "#087075",
          dim: "#0A5C60",
          soft: "#D7EEEE",
          on: "#F8F3EA",
        },
        ember: {
          DEFAULT: "#c4784a",
          soft: "#a05a32",
        },
        mist: {
          DEFAULT: "#6A635B",
          dim: "#8A8278",
        },
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
      boxShadow: {
        paper: "0 12px 36px rgba(28, 25, 22, 0.08)",
        "paper-sm": "0 3px 12px rgba(28, 25, 22, 0.06)",
        teal: "0 6px 16px rgba(11, 138, 143, 0.22)",
      },
      borderRadius: {
        paper: "0.75rem",
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
