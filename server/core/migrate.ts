// Applies SQL migrations in name order, each in its own transaction, and
// records what has run in a `__migrations` table. The files are the ones
// drizzle-kit generates; statements are separated by a breakpoint comment.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'

export interface Migration {
  name: string
  sql: string
}

const BREAKPOINT = '--> statement-breakpoint'

export function readMigrationsFromDir(dir: string): Migration[] {
  return readdirSync(dir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => ({ name: file.replace(/\.sql$/, ''), sql: readFileSync(join(dir, file), 'utf8') }))
}

/** Returns the names of the migrations it applied; empty when up to date. */
export function applyMigrations(sqlite: Database, migrations: Migration[]): string[] {
  sqlite.exec(`create table if not exists __migrations (name text primary key, applied_at integer not null)`)
  const done = new Set(
    (sqlite.prepare(`select name from __migrations`).all() as { name: string }[]).map(row => row.name),
  )
  const record = sqlite.prepare(`insert into __migrations (name, applied_at) values (?, ?)`)
  const applied: string[] = []

  const pending = migrations.filter(m => !done.has(m.name)).sort((a, b) => a.name.localeCompare(b.name))
  for (const migration of pending) {
    const run = sqlite.transaction(() => {
      for (const statement of migration.sql.split(BREAKPOINT)) {
        if (statement.trim()) sqlite.exec(statement)
      }
      const broken = sqlite.pragma('foreign_key_check') as unknown[]
      if (broken.length) throw new Error(`it would leave ${broken.length} row(s) pointing at rows that no longer exist`)
      record.run(migration.name, Date.now())
    })

    // SQLite changes a column by rebuilding the table: create a new one, copy,
    // drop the old one, rename. With foreign keys enforced, that drop would
    // cascade and delete every row that points at the table. Enforcement can
    // only be switched outside a transaction, so it is turned off around each
    // migration and the result is verified before the commit instead.
    const enforced = sqlite.pragma('foreign_keys', { simple: true }) === 1
    sqlite.pragma('foreign_keys = OFF')
    try {
      run()
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Database migration ${migration.name} failed: ${reason}`)
    }
    finally {
      if (enforced) sqlite.pragma('foreign_keys = ON')
    }
    applied.push(migration.name)
  }
  return applied
}
