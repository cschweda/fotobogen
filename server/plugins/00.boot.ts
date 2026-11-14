// Runs once when the server starts. Migration files are bundled into the
// build as Nitro server assets (see nuxt.config.ts), so a deployed app
// needs nothing on disk except its data directory.
import type { Migration } from '../core/migrate.ts'
import { startBoot } from '../utils/app.ts'

async function bundledMigrations(): Promise<Migration[]> {
  const storage = useStorage('assets:migrations')
  const keys = (await storage.getKeys()).filter(key => key.endsWith('.sql'))
  return Promise.all(keys.map(async key => ({
    name: key.replace(/\.sql$/, ''),
    sql: String(await storage.getItem(key)),
  })))
}

export default defineNitroPlugin(() => {
  startBoot(bundledMigrations)
})
