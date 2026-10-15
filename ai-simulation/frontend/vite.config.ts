import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const runnerTarget = 'http://127.0.0.1:3010'
function runnerProxy() {
  return {
    target: runnerTarget,
    changeOrigin: false,
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    proxy: {
      '/api': runnerProxy(),
      '/health': runnerProxy(),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
