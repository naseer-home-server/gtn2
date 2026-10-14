import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDir, '')
  const backendTarget = process.env.GAME_BACKEND_URL ?? env.GAME_BACKEND_URL ?? env.BACKEND_URL ?? `http://localhost:${env.BACKEND_PORT ?? '3000'}`
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(frontendDir, 'src') } },
    server: {
      port: Number(process.env.FRONTEND_PORT ?? env.FRONTEND_PORT ?? 5173),
      strictPort: true,
      proxy: {
        '/api': backendTarget,
        '/trpc': backendTarget,
        '/auth': backendTarget,
      },
    },
    build: {
      outDir: path.resolve(frontendDir, '../backend/public'),
      emptyOutDir: true,
    },
  }
})
