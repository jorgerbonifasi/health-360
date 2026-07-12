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
      },
    },
  },
  plugins: [],
};
