// The running app's shared state: where its data lives, the session secret,
// and the open database. Filled in once by the boot plugin.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { applyRestore, inspectBackup, PENDING_RESTORE } from '../core/backup.ts'
import { applyMigrations, type Migration } from '../core/migrate.ts'
import { dataPaths, ensureDataDirs, resolveDataDir, type DataPaths } from '../core/paths.ts'
import { loadOrCreateSecret } from '../core/secret.ts'
import { loadOrCreateSetupToken } from '../core/setup-token.ts'
import * as schema from '../db/schema.ts'
import type { PipelineContext } from '../pipeline/context.ts'
import { readLimits } from '../pipeline/limits.ts'
import { createQueue, type Queue } from '../pipeline/queue.ts'
import { bundledModules } from '../modules/bundled.ts'
import { createRegistry } from '../modules/registry.ts'
import { createSkinRegistry, readSkinFolders, type SkinFiles, type SkinRegistry } from '../skins/registry.ts'
import { createLocalStorage } from '../storage/local.ts'

export type Db = BetterSQLite3Database<typeof schema>

interface AppState {
  paths: DataPaths
  secret: string
  sqlite: Database.Database
  db: Db
  /** What the upload and processing code works with. */
  pipeline: PipelineContext
  queue: Queue
  skins: SkinRegistry
  /** Cached because every request checks it; it only ever flips to true. */
  setupComplete: boolean
}

let state: AppState | undefined
let ready: Promise<void> | undefined

/**
 * Boot order matters: data directory, secret, database, migrations, and only
 * then the setup token, because whether one is needed depends on the database.
 */
async function boot(loadMigrations: () => Promise<Migration[]>, loadSkins: () => Promise<SkinFiles[]>): Promise<void> {
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  ensureDataDirs(paths)
  const secret = loadOrCreateSecret(paths.secret)

  // A restore the admin asked for is done now, before the database is opened.
  const pending = join(paths.root, PENDING_RESTORE)
  if (existsSync(pending)) {
    try {
      // The same check as a backup uploaded in the admin or restored from the
      // command line gets: one made by a newer version is not restored.
      const inspected = await inspectBackup(pending, (await loadMigrations()).map(migration => migration.name))
      if (!inspected.ok) throw new Error(inspected.message)
      const restored = await applyRestore(paths, pending)
      rmSync(pending, { force: true })
      console.log(`\nRestored a backup with ${restored.photos} photos. What was here before is kept in ${restored.keptIn}.`)
      console.log('Resized copies are being made again; photos appear on the site as each one finishes.\n')
    }
    catch (error) {
      // A backup that cannot be restored must not stop the site from
      // starting, now or on the next restart: set it aside and carry on.
      const aside = join(paths.root, `restore-failed-${Date.now()}.zip`)
      try {
        renameSync(pending, aside)
      }
      catch {
        rmSync(pending, { force: true })
      }
      console.error(`\nThe backup could not be restored: ${error instanceof Error ? error.message : error}`)
      console.error(`Nothing was changed. The file was set aside as ${aside}.\n`)
    }
  }

  const sqlite = new Database(paths.db)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, await loadMigrations())

  const db = drizzle(sqlite, { schema })
  const row = sqlite.prepare(`select value from settings where key = 'site.setup_complete'`).get() as { value: string } | undefined
  const setupComplete = row ? JSON.parse(row.value) === true : false

  // Uploads that were in flight when the server last stopped are gone.
  rmSync(paths.tmp, { recursive: true, force: true })
  mkdirSync(paths.tmp, { recursive: true })
  const pipeline: PipelineContext = {
    sqlite,
    storage: createLocalStorage({ originals: paths.originals, derivatives: paths.derivatives }),
    limits: readLimits(process.env),
    tmpDir: paths.tmp,
    // Bundled modules, plus any the owner has put in data/modules.
    modules: await createRegistry({ bundled: bundledModules, installedDir: paths.modules, sqlite }),
  }
  for (const module of pipeline.modules!.list()) {
    if (module.error) console.warn(`Module "${module.manifest.name}" could not be loaded: ${module.error}`)
  }
  const queue = createQueue(pipeline, {
    // A photo that has just been processed for the first time may now be live.
    onDone: (job) => { if (job.type === 'ingest') void import('./photo-events.ts').then(events => events.photoPublished(job.photoId)) },
    onError: (job, error) => console.error(`Photo ${job.photoId} could not be processed (attempt ${job.attempts}): ${error instanceof Error ? error.message : error}`),
  })
  queue.recover()
  const skins = createSkinRegistry(await loadSkins(), readSkinFolders(paths.skins))
  for (const skin of skins.list()) {
    if (skin.error) console.warn(`Skin "${skin.name}" could not be loaded: ${skin.error}`)
  }
  state = { paths, secret, sqlite, db, setupComplete, pipeline, queue, skins }
  queue.kick()
  void import('./photo-events.ts').then(events => events.watchSchedule())

  const { users } = sqlite.prepare(`select count(*) as users from users`).get() as { users: number }
  if (users === 0) {
    const token = loadOrCreateSetupToken(paths.setupToken)
    console.log(`\nFotobogen setup token: ${token}`)
    console.log('Open the site in a browser and enter this token to finish setup.\n')
  }
}

/** Called once by the boot plugin. A failed boot stops the process. */
export function startBoot(loadMigrations: () => Promise<Migration[]>, loadSkins: () => Promise<SkinFiles[]> = async () => []): void {
  ready = boot(loadMigrations, loadSkins).catch((error) => {
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
export const getPipeline = (): PipelineContext => current().pipeline
export const getQueue = (): Queue => current().queue
export const getSkins = (): SkinRegistry => current().skins
export const isSetupComplete = (): boolean => current().setupComplete
export function markSetupComplete(): void {
  current().setupComplete = true
}
