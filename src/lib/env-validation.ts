/**
 * Validate critical environment variables at startup.
 * Import this module early (e.g. from instrumentation.ts) to fail fast.
 */

const required = ['DATABASE_URL', 'NEXTAUTH_SECRET'] as const

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
    'The application cannot start without these. Check your .env file.'
  )
}

export {}
