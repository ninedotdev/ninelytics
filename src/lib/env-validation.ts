/**
 * Validate critical environment variables at startup.
 * Import this module early (e.g. from instrumentation.ts) to fail fast.
 */

const required = ['DATABASE_URL', 'NEXTAUTH_SECRET'] as const

// Skip validation during build phase — DATABASE_URL is a dummy during Docker build
const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  || process.env.DATABASE_URL?.includes('localhost:5432/build')

if (!isBuild) {
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'The application cannot start without these. Check your .env file.'
    )
  }
}

export {}
