import { createDb, type Db } from '@ninelytics/db/client'

// Re-export with both names for convenience (Db is canonical,
// DB is the legacy alias that some routers still use).
export type { Db, Db as DB } from '@ninelytics/db/client'

let _db: Db | null = null
let _client: ReturnType<typeof createDb>['client'] | null = null

function init() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not defined')
  const r = createDb({
    url,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 20),
    idleTimeout: Number(process.env.DATABASE_POOL_TIMEOUT ?? 30),
    connectTimeout: Number(process.env.DATABASE_CONNECT_TIMEOUT ?? 30),
    // Aggressive default so a stuck query (broken pgbouncer connection,
    // table lock during a CREATE INDEX, etc) fails fast and frees the
    // connection back to the pool instead of blocking the worker forever.
    queryTimeout: Number(process.env.DATABASE_QUERY_TIMEOUT ?? 10),
    prepare: false, // pgbouncer transaction mode
  })
  _db = r.db
  _client = r.client
  return r
}

export function getDb(): Db {
  return _db ?? init().db
}

export function getClient() {
  if (!_client) init()
  return _client!
}

// Proxy export so existing `import { db } from './db'` style keeps working
export const db = new Proxy({} as Db, {
  get: (_t, p) => (getDb() as any)[p],
})
