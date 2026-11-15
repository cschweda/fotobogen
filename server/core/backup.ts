// Backup and restore. A backup is one zip holding everything that cannot
// be made again: the database, the photos exactly as they were uploaded,
// and any skins and modules the owner installed. Resized copies are left
// out; they are rebuilt from the originals after a restore. The session
// secret is left out too, so a backup file is not a key to the site.
//
// Plain TypeScript, shared by the server and the command-line tool.
import Database from 'better-sqlite3'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable, Writable } from 'node:stream'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { newId } from './ids.ts'
import type { DataPaths } from './paths.ts'

export const BACKUP_FORMAT = 1
export const PENDING_RESTORE = 'restore-pending.zip'

export interface BackupManifest {
  format: number
  app: 'fotobogen'
  appVersion: string
  createdAt: string
  /** The newest database migration in the backup; a restore needs an app at least this new. */
  migrations: string[]
  photos: number
  originalsBytes: number
}

/** Every file under a directory, as paths relative to it, with forward slashes. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) found.push(relative(dir, path).split(sep).join('/'))
    }
  }
  walk(dir)
  return found.sort()
}

/**
 * Writes a backup to `output` and resolves when it is complete. The
 * database is copied with VACUUM INTO, which gives a consistent snapshot
 * while the site keeps running.
 */
export async function writeBackup(sqlite: Database.Database, paths: DataPaths, appVersion: string, output: Writable): Promise<BackupManifest> {
  mkdirSync(paths.tmp, { recursive: true })
  const snapshot = join(paths.tmp, `backup-${newId()}.db`)
  try {
    sqlite.prepare(`vacuum into ?`).run(snapshot)
    const originals = filesUnder(paths.originals)
    const { photos } = sqlite.prepare(`select count(*) as photos from photos`).get() as { photos: number }
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      app: 'fotobogen',
      appVersion,
      createdAt: new Date().toISOString(),
      migrations: (sqlite.prepare(`select name from __migrations order by name`).all() as { name: string }[]).map(row => row.name),
      photos,
      originalsBytes: originals.reduce((bytes, file) => bytes + statSync(join(paths.originals, file)).size, 0),
    }

    const zip = new yazl.ZipFile()
    // Photos are already compressed; storing them as they are is fast and loses nothing.
    const stored = { compress: false }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json')
    zip.addFile(snapshot, 'fotobogen.db')
    for (const file of originals) zip.addFile(join(paths.originals, file), `originals/${file}`, stored)
    for (const file of filesUnder(paths.skins)) zip.addFile(join(paths.skins, file), `skins/${file}`)
    for (const file of filesUnder(paths.modules)) zip.addFile(join(paths.modules, file), `modules/${file}`)
    zip.end()
    await pipeline(zip.outputStream as unknown as Readable, output)
    return manifest
  }
  finally {
    rmSync(snapshot, { force: true })
  }
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolveZip, reject) => {
    // yauzl refuses entries with ".." or absolute paths by default.
    yauzl.open(file, { lazyEntries: true }, (error, zip) => error || !zip ? reject(error ?? new Error('The file could not be opened.')) : resolveZip(zip))
  })
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolveStream, reject) => {
    zip.openReadStream(entry, (error, stream) => error || !stream ? reject(error ?? new Error('The entry could not be read.')) : resolveStream(stream))
  })
}

/** Walks the zip, calling `visit` for each file entry in turn. */
async function eachEntry(file: string, visit: (entry: yauzl.Entry, zip: yauzl.ZipFile) => Promise<void>): Promise<void> {
  const zip = await openZip(file)
  try {
    await new Promise<void>((done, reject) => {
      zip.on('entry', (entry: yauzl.Entry) => {
        const isDirectory = entry.fileName.endsWith('/')
        ;(isDirectory ? Promise.resolve() : visit(entry, zip)).then(() => zip.readEntry(), reject)
      })
      zip.on('end', done)
      zip.on('error', reject)
      zip.readEntry()
    })
  }
  finally {
    zip.close()
  }
}

export type Inspection
  = | { ok: true, manifest: BackupManifest }
    | { ok: false, message: string }

/**
 * Checks that a file is a Fotobogen backup this version can restore.
 * `known` is the list of migrations this app has.
 */
export async function inspectBackup(file: string, known: string[]): Promise<Inspection> {
  let manifestText: string | undefined
  let hasDatabase = false
  try {
    await eachEntry(file, async (entry, zip) => {
      if (entry.fileName === 'fotobogen.db') hasDatabase = true
      if (entry.fileName === 'manifest.json' && entry.uncompressedSize < 1_000_000) {
        const chunks: Buffer[] = []
        for await (const chunk of await entryStream(zip, entry)) chunks.push(chunk as Buffer)
        manifestText = Buffer.concat(chunks).toString('utf8')
      }
    })
  }
  catch {
    return { ok: false, message: 'This file is not a zip archive, or it is damaged.' }
  }
  if (!manifestText || !hasDatabase) return { ok: false, message: 'This zip is not a Fotobogen backup: it has no manifest or no database.' }
  let manifest: BackupManifest
  try {
    manifest = JSON.parse(manifestText) as BackupManifest
  }
  catch {
    return { ok: false, message: 'The backup\'s manifest cannot be read.' }
  }
  if (manifest.app !== 'fotobogen' || typeof manifest.format !== 'number' || !Array.isArray(manifest.migrations)) {
    return { ok: false, message: 'This zip is not a Fotobogen backup.' }
  }
  if (manifest.format > BACKUP_FORMAT) return { ok: false, message: 'This backup was made by a newer version of Fotobogen. Update Fotobogen, then restore it.' }
  const unknown = manifest.migrations.filter(name => !known.includes(name))
  if (unknown.length > 0) {
    return { ok: false, message: `This backup was made by a newer version of Fotobogen (${manifest.appVersion}). Update Fotobogen, then restore it.` }
  }
  return { ok: true, manifest }
}

const RESTORED = /^(fotobogen\.db|originals\/[A-Za-z0-9_-][A-Za-z0-9._-]*|(skins|modules)\/[a-z][a-z0-9-]*\/[A-Za-z0-9._/-]+)$/

/** Unpacks a backup into `target`. Only the files a backup is supposed to contain are written. */
async function extractBackup(file: string, target: string): Promise<void> {
  const root = resolve(target)
  await eachEntry(file, async (entry, zip) => {
    if (!RESTORED.test(entry.fileName) || entry.fileName.includes('..')) return
    const destination = resolve(root, entry.fileName)
    if (!destination.startsWith(root + sep)) return
    mkdirSync(dirname(destination), { recursive: true })
    await pipeline(await entryStream(zip, entry), createWriteStream(destination))
  })
}

/**
 * Replaces the site's data with a backup's. The server must not have the
 * database open. What was there before is moved to `before-restore-<time>/`
 * inside the data directory, not deleted. Afterwards every photo is queued
 * to have its resized copies made again.
 */
export async function applyRestore(paths: DataPaths, file: string): Promise<{ photos: number, keptIn: string }> {
  const staging = join(paths.root, `restore-${newId()}`)
  let photos: number
  // Everything that can fail happens here, in a staging folder, before any
  // of the site's own data is moved. A backup that turns out to be unusable
  // leaves the site exactly as it was.
  try {
    await extractBackup(file, staging)
    if (!existsSync(join(staging, 'fotobogen.db'))) throw new Error('The backup has no database in it.')

    let db: Database.Database | undefined
    try {
      db = new Database(join(staging, 'fotobogen.db'), { fileMustExist: true })
      const tables = new Set((db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]).map(row => row.name))
      for (const table of ['photos', 'derivatives', 'jobs', 'users', 'settings', '__migrations']) {
        if (!tables.has(table)) throw new Error(`table "${table}" is missing`)
      }
      if ((db.pragma('quick_check', { simple: true }) as string) !== 'ok') throw new Error('it is damaged')
    }
    catch (error) {
      // Let go of the file before it is cleaned up; Windows will not delete an open file.
      db?.close()
      throw new Error(`The database in this backup cannot be used: ${error instanceof Error ? error.message : error}.`)
    }

    // Resized copies in the backup's database point at files that are not in
    // the backup. Drop those records and queue every photo to be rendered again.
    try {
      const now = Date.now()
      photos = db.transaction(() => {
        db.prepare(`delete from derivatives`).run()
        db.prepare(`delete from jobs`).run()
        const ids = (db.prepare(`select id from photos`).all() as { id: string }[]).map(row => row.id)
        for (const id of ids) {
          db.prepare(`update photos set status = 'processing' where id = ?`).run(id)
          db.prepare(`insert into jobs (id, type, photo_id, status, attempts, created_at) values (?, 'rerender', ?, 'queued', 0, ?)`).run(newId(), id, now)
        }
        return ids.length
      })()
    }
    finally {
      db.close()
    }
  }
  catch (error) {
    rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    throw error
  }

  const keptIn = join(paths.root, `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(keptIn, { recursive: true })
  const move = (from: string, to: string) => {
    if (existsSync(from)) renameSync(from, to)
  }
  for (const name of ['fotobogen.db', 'fotobogen.db-wal', 'fotobogen.db-shm', 'originals', 'derivatives', 'skins', 'modules']) {
    move(join(paths.root, name), join(keptIn, name))
  }
  for (const name of ['fotobogen.db', 'originals', 'skins', 'modules']) move(join(staging, name), join(paths.root, name))
  rmSync(staging, { recursive: true, force: true })
  for (const dir of [paths.originals, paths.derivatives, paths.skins, paths.modules]) mkdirSync(dir, { recursive: true })
  return { photos, keptIn }
}
