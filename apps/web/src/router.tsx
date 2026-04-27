import { createRouter as createTanstackRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { routeTree } from './routeTree.gen'
import { trpc } from './lib/trpc'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Short staleTime so analytics counters feel live. Combined with the
        // server-side Redis cache (15s TTL on heavy queries), worst-case
        // staleness for "visitors today" is ~30s — much better than the
        // previous 60+45s = 105s.
        staleTime: 15_000,
        gcTime: 5 * 60_000,
      },
    },
  })

  const trpcClient = trpc.createClient({
    links: [
      httpBatchLink({
        url:
          typeof window !== 'undefined'
            ? '/api/trpc'
            : `${process.env.API_URL ?? 'http://localhost:3001'}/api/trpc`,
        transformer: superjson,
        fetch: (url, opts) => fetch(url, { ...opts, credentials: 'include' }),
      }),
    ],
  })

  const router = createTanstackRouter({
    routeTree,
    context: { queryClient, trpc, trpcClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    ),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
