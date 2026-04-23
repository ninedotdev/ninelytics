import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Passthrough layout for /websites/$id. Needed because the detail
 * page (_app.websites.\$id.index.tsx) is a full UI — it doesn't
 * render <Outlet />, so without this shim the /settings child route
 * resolves to detail's component and /settings never shows.
 */
export const Route = createFileRoute('/_app/websites/$id')({
  component: WebsiteIdLayout,
})

function WebsiteIdLayout() {
  return <Outlet />
}
