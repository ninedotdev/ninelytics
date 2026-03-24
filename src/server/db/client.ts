import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { DB_CONFIG, getDatabaseUrl } from "@/lib/db-config"
import * as schema from "./schema"

const createClient = () => {
  const url = getDatabaseUrl()

  return postgres(url, {
    max: DB_CONFIG.CONNECTION_LIMIT,
    idle_timeout: DB_CONFIG.POOL_TIMEOUT,
    connect_timeout: DB_CONFIG.CONNECT_TIMEOUT,
    connection: {
      statement_timeout: DB_CONFIG.QUERY_TIMEOUT * 1000,
    },
  })
}

const globalForDb = globalThis as unknown as {
  drizzle?: ReturnType<typeof drizzle<typeof schema>>
  pgClient?: ReturnType<typeof postgres>
}

const pgClient = globalForDb.pgClient ?? createClient()
export const db = globalForDb.drizzle ?? drizzle(pgClient, { schema })

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient
  globalForDb.drizzle = db
}

export type DB = typeof db

