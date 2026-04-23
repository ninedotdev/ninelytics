import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Passthrough layout route for /websites. Without this file, TanStack
 * Router makes _app.websites.index.tsx the parent of /$id and /new —
 * and since the index file renders the full list UI (no <Outlet />),
 * child routes like /websites/:id or /websites/:id/settings never
 * render. Splitting the layout (here) from the index content
 * (_app.websites.index.tsx) fixes that.
 */
export const Route = createFileRoute('/_app/websites')({
  component: WebsitesLayout,
})

function WebsitesLayout() {
  return <Outlet />
}
