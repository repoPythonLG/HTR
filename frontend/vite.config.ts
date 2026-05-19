import { defineConfig, type Plugin } from 'vite'
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

function clouderaHealthPlugin(): Plugin {
  return {
    name: 'cloudera-healthz',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req as { url?: string }).url?.split('?', 1)[0]
        if (path !== '/healthz') {
          next()
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'ok', service: 'travel-expenses-guard' }))
      })
    }
  }
}

export default defineConfig({
  plugins: [clouderaHealthPlugin(), react()],
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
