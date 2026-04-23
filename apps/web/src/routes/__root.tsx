import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sileo'
import { ThemeProvider, useTheme } from 'next-themes'
import type { trpc as trpcRef } from '@/lib/trpc'
import appCss from '@/styles/app.css?url'

export interface RouterContext {
  queryClient: QueryClient
  trpc: typeof trpcRef
  trpcClient: ReturnType<typeof trpcRef.createClient>
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ninelytics' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/logo.png' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Outlet />
          <ThemedToaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

// Match the Next app's pattern: toast palette follows the theme.
function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return (
    <Toaster
      position="bottom-right"
      theme={isDark ? 'light' : 'dark'}
      options={{ fill: isDark ? '#262626' : undefined }}
    />
  )
}
