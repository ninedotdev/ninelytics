import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

export type DbOptions = {
  /** Connection string (e.g. postgres://user:pass@host:port/db). */
  url: string
  /** Max connections in the pool. Default 20. */
  max?: number
  /** Seconds before idle connections are closed. Default 30. */
  idleTimeout?: number
  /** Seconds to wait for a connection. Default 30. */
  connectTimeout?: number
  /** Seconds before a query times out (server-side). Default 60. */
  queryTimeout?: number
  /**
   * Must be false when running through PgBouncer in transaction mode —
   * prepared statements break or hang under load when connections are reused.
   */
  prepare?: boolean
}

/**
 * Build a drizzle client from a connection URL. Each app wires this up with
 * its own env vars. Returns both the drizzle instance and the underlying
 * postgres client (for graceful shutdown).
 */
export function createDb(opts: DbOptions) {
  const client = postgres(opts.url, {
    prepare: opts.prepare ?? false,
    max: opts.max ?? 20,
    idle_timeout: opts.idleTimeout ?? 30,
    connect_timeout: opts.connectTimeout ?? 30,
    connection: {
      statement_timeout: (opts.queryTimeout ?? 60) * 1000,
    },
  })

  const db = drizzle(client, { schema })
  return { db, client, schema }
}

export type Db = ReturnType<typeof createDb>["db"]
