import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(frontendDir, 'src') } },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/trpc': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(frontendDir, '../backend/public'),
    emptyOutDir: true,
  },
})
