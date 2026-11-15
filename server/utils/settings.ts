import { eq } from 'drizzle-orm'
import { settings } from '../db/schema.ts'
import { getDb, type Db } from './app.ts'

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get()
  return row ? row.value as T : fallback
}

/** Insert or replace several settings. Pass a transaction to join one. */
export function setSettings(values: Record<string, unknown>, db: Pick<Db, 'insert'> = getDb()): void {
  for (const [key, value] of Object.entries(values)) {
    db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run()
  }
}
