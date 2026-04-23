import { createFileRoute, Link } from '@tanstack/react-router'
import { SignUpForm } from '@/components/auth/signup-form'

export const Route = createFileRoute('/auth/signup')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
            <p className="text-muted-foreground">Start tracking your sites today</p>
          </div>
          <SignUpForm />
          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/auth/signin" className="underline hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex relative overflow-hidden bg-zinc-950 items-center justify-center p-12">
        <div className="relative z-10 max-w-md space-y-6 text-zinc-100">
          <h2 className="text-3xl font-bold leading-tight">
            Ship analytics your users will thank you for.
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Self-hosted, privacy-first, and built for people who care about
            speed and trust.
          </p>
        </div>
      </div>
    </div>
  )
}
