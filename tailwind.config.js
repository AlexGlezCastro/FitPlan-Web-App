// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default { // ¡Importante: 'export default' en lugar de 'module.exports' para Vite!
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // ¡Esta línea escanea tus componentes!
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}