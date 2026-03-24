export async function register() {
  // Validate critical env vars on every startup
  await import('@/lib/env-validation')

  // Skip for edge runtime — no Node.js APIs available there
  if (process.env.NEXT_RUNTIME === 'edge') return

  if (process.env.NODE_ENV === 'production') {
    const { ensureMaxmindDatabase } = await import('@/lib/maxmind-updater')
    await ensureMaxmindDatabase()
  }

  // Set up the workflow postgres world programmatically using dynamic import().
  //
  // We cannot rely on WORKFLOW_TARGET_WORLD env var because the workflow package
  // internally uses require() (CJS) to load the world — which fails for
  // @workflow/world-postgres since it is ESM-only ("type": "module").
  //
  // Instead: import the world with await import() (works for ESM), create the
  // world instance ourselves, and register it with setWorld() so all subsequent
  // getWorld() calls return our pre-built instance without ever calling require().
  const { setWorld } = await import('workflow/runtime')
  const { createWorld } = await import('@workflow/world-postgres')
  const world = createWorld({
    connectionString: process.env.DATABASE_URL!,
  })
  setWorld(world)
  try {
    await world.start?.()
  } catch (err) {
    // Non-fatal — e.g. during build's page-data collection phase the DB
    // may not be reachable. The worker starts cleanly at actual server boot.
    console.warn('[workflow] World start skipped:', (err as Error).message)
  }
}
