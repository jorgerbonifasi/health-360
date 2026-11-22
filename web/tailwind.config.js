/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Health 360 pillar colors, reused across charts + bars.
        movement: "#3b82f6", // blue
        exercise: "#f97316", // orange
        weight: "#10b981", // emerald
        // App chrome: near-black canvas, raised card surface, one lime accent.
        canvas: "#000000",
        surface: "#1c1c1e",
        raised: "#2c2c2e",
        accent: "#a3e635",
      },
    },
  },
  plugins: [],
};
