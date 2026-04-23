import { Hono } from 'hono'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/trpc/root'
import { createTRPCContext } from '@/trpc/trpc'
import { getSession } from '@/lib/session'

export const trpc = new Hono()

trpc.all('/*', async (c) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: c.req.raw.headers,
        getSession: () => getSession(c.req.raw),
      }),
    onError: ({ error, path }) => {
      console.error(`[trpc] ${path ?? '<no-path>'}:`, error.message)
    },
  })
})
