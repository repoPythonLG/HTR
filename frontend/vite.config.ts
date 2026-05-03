import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: {
  env: Record<string, string | undefined>
}

const configuredPort = Number(process.env.VITE_PORT || 8090)
const configuredHost = process.env.VITE_HOST || '0.0.0.0'
const proxyTarget = process.env.VITE_API_PROXY_TARGET
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    port: configuredPort,
    host: configuredHost,
    strictPort: true,
    ...(allowedHosts.length ? { allowedHosts } : {}),
    ...(proxyTarget
      ? {
          proxy: {
            '/api': {
              target: proxyTarget,
              changeOrigin: true
            },
            '/health': {
              target: proxyTarget,
              changeOrigin: true
            }
          }
        }
      : {})
  }
})
