import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { useSession } from '@/lib/auth'

/**
 * Layout route for every authenticated page. Auth enforcement is purely
 * client-side via useSession — an SSR guard would need cookie forwarding
 * from the incoming request which @tanstack/react-start doesn't expose
 * stably yet.
 *   - While session is loading → neutral shell (no leak)
 *   - Unauthenticated → hard redirect to /auth/signin
 *   - Authenticated → render AppLayout (sidebar + header + outlet)
 */
export const Route = createFileRoute('/_app')({
  component: AuthedAppLayout,
})

function AuthedAppLayout() {
  const session = useSession()

  if (session.isLoading || !session.isFetched) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!session.data?.user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signin'
    }
    return null
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
