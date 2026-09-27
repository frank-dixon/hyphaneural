/** Quiet Protomol — ultra-light token map (mirror of static/css/hyphaneural.css) */
module.exports = {
  content: ["./templates/**/*.html", "./static/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        void: "#07090b",
        "void-elev": "#0c1014",
        "void-panel": "#0e1419",
        teal: "#3d9e8f",
        "teal-dim": "#1a4a44",
        ember: "#c4784a",
        mist: "#8a9aa3",
        "mist-dim": "#4a5560",
        ink: "#d4dce2",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
