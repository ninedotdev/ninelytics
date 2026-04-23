import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
  ],
  // Silence "use client" warnings from third-party deps (framer-motion,
  // @tanstack/react-query, etc.) — Next-RSC boundary markers which Vite
  // can't use but still safely bundles. Our own source is already clean.
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          typeof warning.message === 'string' &&
          warning.message.includes('"use client"')
        ) {
          return
        }
        warn(warning)
      },
    },
  },
  server: {
    port: 3000,
    // API running alongside (in docker-compose). In dev we proxy to Bun
    // directly — in prod, Traefik sits in front and routes by path.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
