import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import * as schema from './schema.js'

const { Pool } = pg
export type AppDb = NodePgDatabase<typeof schema>

let pool: pg.Pool | null = null
let db: AppDb | null = null
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

export async function initDb(): Promise<AppDb> {
  if (db) return db
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) throw new Error('DATABASE_URL environment variable is required')
  const parsedUrl = new URL(rawUrl)
  const sslMode = parsedUrl.searchParams.get('sslmode')
  parsedUrl.searchParams.delete('sslmode')

  // Match ai-applets' PostgreSQL setup, including its private-CA TLS deployment.
  pool = new Pool({
    connectionString: parsedUrl.toString(),
    ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  db = drizzle(pool, { schema })
  try {
    await migrate(db, { migrationsFolder })
    return db
  } catch (error) {
    await pool.end()
    pool = null
    db = null
    throw error
  }
}

export function getDb(): AppDb {
  if (!db) throw new Error('Database not initialized; call initDb() first')
  return db
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end()
  pool = null
  db = null
}
