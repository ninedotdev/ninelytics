import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // Root always bounces: session resolution happens in /dashboard and
    // /auth/signin routes. We send users to /dashboard which itself
    // redirects to signin if unauthenticated.
    throw redirect({ to: '/dashboard' })
  },
})
