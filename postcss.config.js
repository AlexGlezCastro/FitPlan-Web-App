// postcss.config.js
export default {
  plugins: {
    // CAMBIO AQUÍ: Usamos el nuevo paquete que nos pidió el error
    // Reemplaza 'tailwindcss: {}' con la siguiente línea:
    '@tailwindcss/postcss': {}, // <--- ¡CAMBIO IMPORTANTE!
    autoprefixer: {},
  },
};