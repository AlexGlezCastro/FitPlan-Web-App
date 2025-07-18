import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // --- ¡AÑADE ESTA SECCIÓN ABAJO DE 'plugins'! ---
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore'] // Añade los módulos de Firebase que usas
  }
  // -----------------------------------------------
})