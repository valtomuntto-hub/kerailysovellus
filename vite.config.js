import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Ohjataan kaikki /api -alkuiset pyynnöt Verceliin
      '/api': {
        target: 'https://kerailylista1.vercel.app', // ⚠️ VAIHDA TÄHÄN OMAN VERCEL-PROJEKTISI LIVE-OSOITE
        changeOrigin: true,
        secure: true,
      },
    },
  },
})