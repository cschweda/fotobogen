// The running app's shared state: where its data lives, the session secret,
// and the open database. Filled in once by the boot plugin.
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { applyMigrations, type Migration } from '../core/migrate.ts'
import { dataPaths, ensureDataDirs, resolveDataDir, type DataPaths } from '../core/paths.ts'
import { loadOrCreateSecret } from '../core/secret.ts'
import { loadOrCreateSetupToken } from '../core/setup-token.ts'
import * as schema from '../db/schema.ts'

export type Db = BetterSQLite3Database<typeof schema>

interface AppState {
  paths: DataPaths
  secret: string
  sqlite: Database.Database
  db: Db
  /** Cached because every request checks it; it only ever flips to true. */
  setupComplete: boolean
}

let state: AppState | undefined
let ready: Promise<void> | undefined

/**
 * Boot order matters: data directory, secret, database, migrations, and only
 * then the setup token, because whether one is needed depends on the database.
 */
async function boot(loadMigrations: () => Promise<Migration[]>): Promise<void> {
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  ensureDataDirs(paths)
  const secret = loadOrCreateSecret(paths.secret)

  const sqlite = new Database(paths.db)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, await loadMigrations())

  const db = drizzle(sqlite, { schema })
  const row = sqlite.prepare(`select value from settings where key = 'site.setup_complete'`).get() as { value: string } | undefined
  const setupComplete = row ? JSON.parse(row.value) === true : false
  state = { paths, secret, sqlite, db, setupComplete }

  const { users } = sqlite.prepare(`select count(*) as users from users`).get() as { users: number }
  if (users === 0) {
    const token = loadOrCreateSetupToken(paths.setupToken)
    console.log(`\nFotobogen setup token: ${token}`)
    console.log('Open the site in a browser and enter this token to finish setup.\n')
  }
}

/** Called once by the boot plugin. A failed boot stops the process. */
export function startBoot(loadMigrations: () => Promise<Migration[]>): void {
  ready = boot(loadMigrations).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Fotobogen could not start: ${message}`)
    process.exit(1)
  })
}

/** Requests wait on this so none is served before migrations have run. */
export function whenReady(): Promise<void> {
  return ready ?? Promise.resolve()
}

function current(): AppState {
  if (!state) throw new Error('Fotobogen has not finished starting.')
  return state
}

export const getPaths = (): DataPaths => current().paths
export const getSecret = (): string => current().secret
export const getSqlite = (): Database.Database => current().sqlite
export const getDb = (): Db => current().db
export const isSetupComplete = (): boolean => current().setupComplete
export function markSetupComplete(): void {
  current().setupComplete = true
}
