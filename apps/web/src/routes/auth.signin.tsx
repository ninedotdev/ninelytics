import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSession } from '@/lib/auth'
import { SignInForm } from '@/components/auth/signin-form'

export const Route = createFileRoute('/auth/signin')({
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const session = useSession()

  useEffect(() => {
    if (session.data?.user) {
      navigate({ to: '/dashboard' })
    }
  }, [session.data, navigate])

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground">
              Sign in to your analytics dashboard
            </p>
          </div>
          <SignInForm />
          <div className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/auth/signup" className="underline hover:text-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </div>

      {/* Right — visual panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-zinc-950 items-center justify-center p-12">
        <div className="relative z-10 max-w-md space-y-6 text-zinc-100">
          <h2 className="text-3xl font-bold leading-tight">
            Privacy-first analytics that respects your visitors.
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Own your data. No cookies, no personal tracking, no third-party
            scripts — just the metrics you actually need.
          </p>
        </div>
      </div>
    </div>
  )
}
