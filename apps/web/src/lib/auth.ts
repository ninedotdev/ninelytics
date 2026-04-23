import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: 'ADMIN' | 'OWNER' | 'VIEWER'
  isSuperAdmin: boolean
}

export type Session = { user: SessionUser }

async function fetchSession(): Promise<Session | null> {
  const res = await fetch('/api/auth/session', {
    credentials: 'include',
    // Hard bail so a hung/misrouted request can't leave the dashboard
    // stuck on 'Loading…' forever.
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401) return null
  if (!res.ok) return null
  return (await res.json()) as Session
}

/** Current session. Returns `null` on the client if the user isn't signed in. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    staleTime: 60_000,
    retry: false,
  })
}

export function useSignIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })
      const data = (await res.json()) as { error?: string; user?: SessionUser }
      if (!res.ok) throw new Error(data.error ?? `Signin failed (${res.status})`)
      return data.user!
    },
    onSuccess: (user) => {
      qc.setQueryData(['session'], { user })
    },
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    },
    onSuccess: () => {
      qc.setQueryData(['session'], null)
      qc.invalidateQueries()
    },
  })
}

export function useSignUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; password: string; name?: string }) => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })
      const data = (await res.json()) as { error?: string; user?: SessionUser }
      if (!res.ok) throw new Error(data.error ?? `Signup failed (${res.status})`)
      return data.user!
    },
    onSuccess: (user) => {
      qc.setQueryData(['session'], { user })
    },
  })
}
