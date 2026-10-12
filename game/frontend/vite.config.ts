import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const backendUrl = process.env.GAME_BACKEND_URL ?? 'http://localhost:3000'
const frontendDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(frontendDir, 'src') } },
  server: {
    proxy: {
      '/api': backendUrl,
      '/trpc': backendUrl,
      '/auth': backendUrl,
    },
  },
  build: {
    outDir: path.resolve(frontendDir, '../backend/public'),
    emptyOutDir: true,
  },
})
