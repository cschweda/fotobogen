// Runs once when the server starts. Migration files are bundled into the
// build as Nitro server assets (see nuxt.config.ts), so a deployed app
// needs nothing on disk except its data directory.
import { existsSync } from 'node:fs'
import { config } from '../core/config.ts'
import type { Migration } from '../core/migrate.ts'
import type { SkinFiles } from '../skins/registry.ts'
import { startBoot } from '../utils/app.ts'

async function bundledMigrations(): Promise<Migration[]> {
  const storage = useStorage('assets:migrations')
  const keys = (await storage.getKeys()).filter(key => key.endsWith('.sql'))
  return Promise.all(keys.map(async key => ({
    name: key.replace(/\.sql$/, ''),
    sql: String(await storage.getItem(key)),
  })))
}

/** The skins bundled into the build: skins/<name>/skin.json and skin.css. */
async function bundledSkins(): Promise<SkinFiles[]> {
  const storage = useStorage('assets:skins')
  const names = [...new Set((await storage.getKeys()).map(key => key.split(':')[0]!))]
  return Promise.all(names.map(async (name) => {
    const json = await storage.getItem(`${name}:skin.json`)
    return {
      name,
      json: typeof json === 'string' ? json : JSON.stringify(json ?? {}),
      css: String(await storage.getItem(`${name}:skin.css`) ?? ''),
    }
  }))
}

export default defineNitroPlugin(() => {
  // scripts/start.mjs normally does this before the server is loaded. When
  // the server is started directly, read .env here and fall back to the
  // configured port, so the settings are the same either way.
  if (existsSync('.env')) process.loadEnvFile('.env')
  process.env.PORT ||= String(config.server.port)
  startBoot(bundledMigrations, bundledSkins)
})
