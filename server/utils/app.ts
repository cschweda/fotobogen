// The running app's shared state: where its data lives, the session secret,
// and the open database. Filled in once by the boot plugin.
import Database from 'better-sqlite3'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { resolveSettings } from '../core/config.ts'
import { adminHostProblem } from '../core/hosts.ts'
import { applyRestore, inspectBackup, PENDING_ADMIN_RESTORE, PENDING_RESTORE } from '../core/backup.ts'
import { applyMigrations, type Migration } from '../core/migrate.ts'
import { dataPaths, ensureDataDirs, resolveDataDir, type DataPaths } from '../core/paths.ts'
import { loadOrCreateSecret } from '../core/secret.ts'
import { loadOrCreateSetupToken } from '../core/setup-token.ts'
import * as schema from '../db/schema.ts'
import type { PipelineContext } from '../pipeline/context.ts'
import { readLimits } from '../pipeline/limits.ts'
import { createQueue, type Queue } from '../pipeline/queue.ts'
import { emptyOldTrash, TRASH_DAYS } from '../pipeline/remove.ts'
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
  // Two settings that only make sense together; said before anything is opened.
  const hostsProblem = adminHostProblem(resolveSettings(process.env).adminHost, resolveSettings(process.env).siteUrl)
  if (hostsProblem) throw new Error(hostsProblem)
  ensureDataDirs(paths)
  const secret = loadOrCreateSecret(paths.secret)

  // A restore that is waiting is done now, before the database is opened: a
  // backup uploaded in the admin (restored without its modules, which are
  // code), or one put in the data folder by hand.
  for (const [name, withModules] of [[PENDING_ADMIN_RESTORE, false], [PENDING_RESTORE, true]] as const) {
    const pending = join(paths.root, name)
    if (!existsSync(pending)) continue
    try {
      // The same check as a backup restored from the command line gets:
      // one made by a newer version is not restored.
      const inspected = await inspectBackup(pending, (await loadMigrations()).map(migration => migration.name))
      if (!inspected.ok) throw new Error(inspected.message)
      const restored = await applyRestore(paths, pending, { modules: withModules })
      rmSync(pending, { force: true })
      console.log(`\nRestored a backup with ${restored.photos} photos. What was here before is kept in ${restored.keptIn}.`)
      if (!withModules && inspected.modules.length > 0) {
        console.log(`The backup's modules were not installed (${inspected.modules.join(', ')}): a module is code, and one uploaded through the admin is never run. To install them, restore the backup on the server with "pnpm fotobogen restore", or copy them into the modules folder.`)
      }
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
  // The database holds the login's password hash and the webhooks' secrets:
  // for the user running Fotobogen only. (Windows has no such file modes.)
  if (process.platform !== 'win32') {
    for (const file of [paths.db, `${paths.db}-wal`, `${paths.db}-shm`, paths.originals]) {
      try {
        chmodSync(file, file === paths.originals ? 0o700 : 0o600)
      }
      catch { /* a file that is not there yet, or a filesystem without modes */ }
    }
  }

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
    // A photo new to the site, or back on it from the trash, is announced to webhooks once it can be seen.
    onDone: (job) => { if (job.type === 'ingest' || job.type === 'restore') void import('./photo-events.ts').then(events => events.photoPublished(job.photoId)) },
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
  // What has been in the trash for thirty days is removed for good: now, and every six hours while running.
  const clearTrash = () => emptyOldTrash(pipeline).then(({ count }) => {
    if (count > 0) console.log(`Removed ${count} ${count === 1 ? 'photo' : 'photos'} that had been in the trash for ${TRASH_DAYS} days.`)
  }).catch(error => console.warn(`The trash could not be cleared: ${(error as Error).message}`))
  void clearTrash()
  setInterval(clearTrash, 6 * 60 * 60 * 1000).unref()

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
