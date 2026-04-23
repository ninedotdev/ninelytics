/**
 * Production server wrapper for TanStack Start.
 *
 * dist/server/server.js only handles SSR — it's a fetch(req) handler.
 * Static assets (CSS, client JS chunks, images) live in dist/client/
 * and nothing serves them by default. Traefik/Coolify only routes the
 * FQDN to this container, so /api/* calls from the browser need to be
 * forwarded to the Hono API here — otherwise they hit SSR and hang.
 *
 * This wrapper uses Bun.serve to:
 *   1. /_health fast-path for docker healthchecks
 *   2. Static files out of dist/client/
 *   3. /api/* proxy → the api container (API_URL env)
 *   4. Everything else → SSR handler
 */
import { file } from 'bun'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ssr from './dist/server/server.js'

const CLIENT_DIR = join(import.meta.dir, 'dist', 'client')
const PORT = Number(process.env.PORT ?? 3000)
const API_URL = process.env.API_URL ?? 'http://localhost:3001'
const API_HOST = new URL(API_URL).host

export default {
  port: PORT,
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url)
    const pathname = decodeURIComponent(url.pathname)

    // Healthcheck: also probes the api so Coolify restarts us when the
    // web↔api path is broken (not just when SSR is up).
    if (pathname === '/_health') {
      try {
        const r = await fetch(`${API_URL}/api/health`, {
          signal: AbortSignal.timeout(2000),
        })
        if (!r.ok) return new Response('api unhealthy', { status: 503 })
        return new Response('ok', {
          status: 200,
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        })
      } catch {
        return new Response('api unreachable', { status: 503 })
      }
    }

    // /api/* → forward to the Hono API container. Same-origin keeps
    // cookies + CORS trivial.
    if (pathname.startsWith('/api/')) {
      const target = `${API_URL}${pathname}${url.search}`
      const headers = new Headers(req.headers)
      headers.set('host', API_HOST)
      headers.delete('connection')

      // Propagate client abort + hard timeout. Without this a slow upstream
      // piles hung requests in Bun's connection pool and the web appears
      // frozen until a redeploy clears it.
      const timeoutMs = pathname.startsWith('/api/ai-chat') ? 120_000 : 25_000
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)])

      try {
        return await fetch(target, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
          // @ts-ignore — Bun supports request body streaming via duplex
          duplex: 'half',
          redirect: 'manual',
          signal,
        })
      } catch (err) {
        if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
          return new Response('Upstream timeout', { status: 504 })
        }
        console.error(
          `[proxy] ${req.method} ${pathname} → ${target} failed:`,
          err?.message ?? err,
        )
        return new Response('Bad gateway', { status: 502 })
      }
    }

    // Static asset lookup. Path traversal block + require real file.
    if (!pathname.includes('..') && pathname !== '/') {
      const abs = join(CLIENT_DIR, pathname)
      if (abs.startsWith(CLIENT_DIR) && existsSync(abs)) {
        const stat = statSync(abs)
        if (stat.isFile()) {
          return new Response(file(abs), {
            headers: pathname.startsWith('/assets/')
              ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
              : {},
          })
        }
      }
    }

    return ssr.fetch(req)
  },
}

console.log(`[web] listening on :${PORT} (api proxy → ${API_URL})`)
