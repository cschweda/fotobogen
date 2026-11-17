import Database from 'better-sqlite3'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { applyRestore, inspectBackup, writeBackup } from '../../server/core/backup.ts'
import { fileURLToPath } from 'node:url'
import { applyMigrations, readMigrationsFromDir } from '../../server/core/migrate.ts'
import { dataPaths } from '../../server/core/paths.ts'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { createAlbum, addToAlbum, setPhotoTags } from '../../server/pipeline/collections.ts'
import { updatePhoto } from '../../server/pipeline/library.ts'
import { processPhoto } from '../../server/pipeline/render.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

const migrationsDir = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))
const KNOWN = ['0000_initial', '0001_albums_and_tags', '0002_scheduled_publishing', '0003_licence_and_download', '0004_api_tokens', '0005_trash', '0006_pages', '0007_private_albums', '0008_front_page', '0009_two_step']

async function site() {
  const ctx = testContext()
  const paths = dataPaths(ctx.root)
  const ids: string[] = []
  for (const seed of [1, 2]) {
    const tmpPath = await imageFile(join(ctx.tmpDir, `up-${seed}`), { seed, width: 200, height: 150 })
    const outcome = await acceptUpload(ctx, { tmpPath, filename: `p${seed}.jpg` })
    if (outcome.result !== 'accepted') throw new Error('not accepted')
    await processPhoto(ctx, outcome.photo.id)
    ids.push(outcome.photo.id)
  }
  updatePhoto(ctx, ids[0]!, { title: 'Harbour', alt: 'Boats', takenAt: 1714694400000 })
  setPhotoTags(ctx, ids[0]!, ['sea'])
  addToAlbum(ctx, (createAlbum(ctx, { title: 'Trip' }) as { id: string }).id, ids)
  mkdirSync(join(paths.skins, 'paper'), { recursive: true })
  writeFileSync(join(paths.skins, 'paper', 'skin.css'), 'body{}')
  writeFileSync(join(paths.root, 'secret'), 'a-very-secret-session-key-that-must-not-leave')
  return { ctx, paths, ids }
}
async function backupOf(ctx: Awaited<ReturnType<typeof site>>['ctx'], paths: ReturnType<typeof dataPaths>) {
  const file = join(mkdtempSync(join(tmpdir(), 'fb-backup-')), 'backup.zip')
  const manifest = await writeBackup(ctx.sqlite, paths, '0.1.0', createWriteStream(file))
  return { file, manifest }
}
const TWO_STEP_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const TWO_STEP_CODES = '[{"code":"abcde-fghjk","usedAt":null}]'
/** Gives the site its owner, with two-step login as described. */
function owner(sqlite: Database.Database, options: { password?: string, secret?: string, codes?: string, lastStep?: number }) {
  sqlite.prepare(`insert into users (id, username, password_hash, role, session_version, created_at, totp_secret, totp_last_step, backup_codes) values ('u1', 'ansel', ?, 'admin', 1, 1, ?, ?, ?)`)
    .run(options.password ?? 'hash', options.secret ?? null, options.lastStep ?? null, options.codes ?? null)
}
function zipOfFiles(entries: Record<string, string>): Promise<string> {
  const file = join(mkdtempSync(join(tmpdir(), 'fb-zip-')), 'x.zip')
  const zip = new yazl.ZipFile()
  for (const [name, path] of Object.entries(entries)) zip.addFile(path, name)
  zip.end()
  return new Promise(done => zip.outputStream.pipe(createWriteStream(file)).on('close', () => done(file)))
}
function zipOf(entries: Record<string, string>): Promise<string> {
  const file = join(mkdtempSync(join(tmpdir(), 'fb-zip-')), 'x.zip')
  const zip = new yazl.ZipFile()
  for (const [name, text] of Object.entries(entries)) zip.addBuffer(Buffer.from(text), name)
  zip.end()
  return new Promise(done => zip.outputStream.pipe(createWriteStream(file)).on('close', () => done(file)))
}

describe('a backup', () => {
  it('holds the database, the uploaded photos, and installed skins, with a manifest', async () => {
    const { ctx, paths } = await site()
    const { file, manifest } = await backupOf(ctx, paths)
    expect(manifest).toMatchObject({ format: 1, app: 'fotobogen', appVersion: '0.1.0', photos: 2, migrations: KNOWN })
    expect(manifest.originalsBytes).toBeGreaterThan(0)
    expect(await inspectBackup(file, KNOWN)).toEqual({ ok: true, manifest, modules: [] })
    expect(readdirSync(ctx.tmpDir)).toEqual([]) // the database snapshot is cleaned up
  })

  it('never contains the session secret or the resized copies', async () => {
    const { ctx, paths } = await site()
    const { file } = await backupOf(ctx, paths)
    const bytes = readFileSync(file)
    expect(bytes.includes('a-very-secret-session-key')).toBe(false)
    const restored = dataPaths(join(mkdtempSync(join(tmpdir(), 'fb-restore-')), 'data'))
    mkdirSync(restored.root, { recursive: true })
    await applyRestore(restored, file)
    expect(existsSync(restored.secret)).toBe(false)
    expect(readdirSync(restored.derivatives)).toEqual([])
  })

  // Found after the audit of 17 November 2026: a backup carried the two-step key and codes, so a browser
  // that was merely logged in could fetch them without the password the admin asks for before showing them.
  it('never contains the two-step login key or the backup codes', async () => {
    const { ctx, paths } = await site()
    owner(ctx.sqlite, { secret: TWO_STEP_KEY, codes: TWO_STEP_CODES })
    const { file } = await backupOf(ctx, paths)
    const restored = dataPaths(join(mkdtempSync(join(tmpdir(), 'fb-restore-')), 'data'))
    mkdirSync(restored.root, { recursive: true })
    await applyRestore(restored, file)
    // Not in the row, and not left behind anywhere else in the file.
    const bytes = readFileSync(restored.db)
    expect(bytes.includes(TWO_STEP_KEY)).toBe(false)
    expect(bytes.includes('abcde-fghjk')).toBe(false)
    const db = new Database(restored.db)
    expect(db.prepare(`select username, totp_secret, totp_last_step, backup_codes from users`).all()).toEqual([{ username: 'ansel', totp_secret: null, totp_last_step: null, backup_codes: null }])
    db.close()
    // The site that was backed up is untouched.
    expect(ctx.sqlite.prepare(`select totp_secret from users`).get()).toEqual({ totp_secret: TWO_STEP_KEY })
  })

  it('leaves two-step login as the site has it when a backup is restored, whatever the backup says', async () => {
    // The backup: from a site whose owner has another password. As made by a hand that wants in, it also
    // carries a key of its own; and a second one is from before two-step login existed at all.
    const source = await site()
    owner(source.ctx.sqlite, { password: 'hash-from-the-backup', secret: 'MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK', codes: '[{"code":"zzzzz-zzzzz","usedAt":null}]' })
    const unscrubbed = join(mkdtempSync(join(tmpdir(), 'fb-crafted-')), 'fotobogen.db')
    source.ctx.sqlite.prepare(`vacuum into ?`).run(unscrubbed)
    const older = join(mkdtempSync(join(tmpdir(), 'fb-older-')), 'fotobogen.db')
    source.ctx.sqlite.prepare(`vacuum into ?`).run(older)
    const old = new Database(older)
    for (const column of ['totp_secret', 'totp_last_step', 'backup_codes']) old.exec(`alter table users drop column ${column}`)
    old.prepare(`delete from __migrations where name = '0009_two_step'`).run()
    old.close()

    for (const database of [unscrubbed, older]) {
      const target = await site()
      owner(target.ctx.sqlite, { secret: TWO_STEP_KEY, codes: TWO_STEP_CODES, lastStep: 57 })
      target.ctx.sqlite.close()
      await applyRestore(target.paths, await zipOfFiles({ 'fotobogen.db': database }))
      const db = new Database(target.paths.db)
      // The password is the backup's, as it always was after a restore; the second step is still the site's own.
      expect(db.prepare(`select password_hash, totp_secret, totp_last_step, backup_codes from users`).all(), database).toEqual([{ password_hash: 'hash-from-the-backup', totp_secret: TWO_STEP_KEY, totp_last_step: 57, backup_codes: TWO_STEP_CODES }])
      // And the database is one this version starts on: nothing is left for it to trip over.
      expect(applyMigrations(db, readMigrationsFromDir(migrationsDir)), database).toEqual([])
      db.close()
    }

    // A site with two-step login off stays off, too: a backup cannot switch it on with a key of its choosing.
    const plain = await site()
    owner(plain.ctx.sqlite, {})
    plain.ctx.sqlite.close()
    await applyRestore(plain.paths, await zipOfFiles({ 'fotobogen.db': unscrubbed }))
    const db = new Database(plain.paths.db)
    expect(db.prepare(`select totp_secret, backup_codes from users`).get()).toEqual({ totp_secret: null, backup_codes: null })
    db.close()
  })

  it('restores into an empty data directory and queues every photo to be rendered again', async () => {
    const { ctx, paths, ids } = await site()
    const { file } = await backupOf(ctx, paths)
    const restored = dataPaths(join(mkdtempSync(join(tmpdir(), 'fb-restore-')), 'data'))
    mkdirSync(restored.root, { recursive: true })
    expect(await applyRestore(restored, file)).toMatchObject({ photos: 2 })

    const db = new Database(restored.db)
    expect(db.prepare(`select title, alt, taken_at, status from photos where id = ?`).get(ids[0])).toEqual({ title: 'Harbour', alt: 'Boats', taken_at: 1714694400000, status: 'processing' })
    expect(db.prepare(`select count(*) as n from derivatives`).get()).toEqual({ n: 0 })
    expect(db.prepare(`select type, status, count(*) as n from jobs group by type, status`).all()).toEqual([{ type: 'rerender', status: 'queued', n: 2 }])
    expect(db.prepare(`select name from tags`).all()).toEqual([{ name: 'sea' }])
    expect(db.prepare(`select count(*) as n from album_photos`).get()).toEqual({ n: 2 })
    db.close()
    expect(readdirSync(restored.originals).sort()).toEqual(ids.map(id => `${id}.jpg`).sort())
    expect(readFileSync(join(restored.skins, 'paper', 'skin.css'), 'utf8')).toBe('body{}')
  })

  it('keeps what was there before a restore instead of deleting it', async () => {
    const first = await site()
    const { file } = await backupOf(first.ctx, first.paths)
    const second = await site() // a different site, with its own photos
    second.ctx.sqlite.close()
    const before = readdirSync(second.paths.originals)
    const result = await applyRestore(second.paths, file)
    expect(readdirSync(join(result.keptIn, 'originals')).sort()).toEqual(before.sort())
    expect(existsSync(join(result.keptIn, 'fotobogen.db'))).toBe(true)
    expect(readdirSync(second.paths.originals).sort()).toEqual(first.ids.map(id => `${id}.jpg`).sort())
    expect(readFileSync(second.paths.secret, 'utf8')).toContain('a-very-secret') // the site's own secret is untouched
  })

  it('is refused when it is not a backup, is damaged, or comes from a newer version', async () => {
    const notZip = join(mkdtempSync(join(tmpdir(), 'fb-zip-')), 'photo.jpg')
    writeFileSync(notZip, 'not a zip at all')
    expect(await inspectBackup(notZip, KNOWN)).toEqual({ ok: false, message: 'This file is not a zip archive, or it is damaged.' })
    expect(await inspectBackup(await zipOf({ 'holiday.txt': 'hello' }), KNOWN)).toMatchObject({ ok: false, message: expect.stringContaining('not a Fotobogen backup') })
    expect(await inspectBackup(await zipOf({ 'manifest.json': '{"app":"other"}', 'fotobogen.db': 'x' }), KNOWN)).toMatchObject({ ok: false })
    const newer = { format: 1, app: 'fotobogen', appVersion: '9.0.0', createdAt: 'x', migrations: [...KNOWN, '0099_future'], photos: 0, originalsBytes: 0 }
    expect(await inspectBackup(await zipOf({ 'manifest.json': JSON.stringify(newer), 'fotobogen.db': 'x' }), KNOWN)).toEqual({
      ok: false, message: 'This backup was made by a newer version of Fotobogen (9.0.0). Update Fotobogen, then restore it.',
    })
  })

  it('writes only the files a backup is meant to hold, wherever a crafted zip says to put them', async () => {
    const manifest = { format: 1, app: 'fotobogen', appVersion: '0.1.0', createdAt: 'x', migrations: KNOWN, photos: 0, originalsBytes: 0 }
    const { ctx, paths } = await site()
    const real = await backupOf(ctx, paths)
    void real
    const crafted = await zipOf({
      'manifest.json': JSON.stringify(manifest),
      'secret': 'attacker-chosen-secret',
      'setup-token': 'attacker-token',
      'originals/sub/dir.jpg': 'x',
      'modules/Evil Name/index.mjs': 'x',
      'modules/ok/index.mjs': 'export default {}',
      'notes.txt': 'x',
    })
    const target = dataPaths(join(mkdtempSync(join(tmpdir(), 'fb-restore-')), 'data'))
    mkdirSync(target.root, { recursive: true })
    await expect(applyRestore(target, crafted)).rejects.toThrow('no database')
    expect(readdirSync(target.root)).toEqual([]) // nothing left behind
  })

  it('leaves the site untouched when the database in a backup is not usable', async () => {
    const manifest = { format: 1, app: 'fotobogen', appVersion: '0.1.0', createdAt: 'x', migrations: KNOWN, photos: 0, originalsBytes: 0 }
    const { ctx, paths } = await site()
    ctx.sqlite.close()
    const before = readdirSync(paths.root).sort()
    const garbage = await zipOf({ 'manifest.json': JSON.stringify(manifest), 'fotobogen.db': 'this is not a database' })
    await expect(applyRestore(paths, garbage)).rejects.toThrow('The database in this backup cannot be used')
    // A real database, but not Fotobogen's.
    const other = join(mkdtempSync(join(tmpdir(), 'fb-other-')), 'other.db')
    const foreign = new Database(other)
    foreign.exec('create table notes (id integer primary key)')
    foreign.close()
    const wrong = join(mkdtempSync(join(tmpdir(), 'fb-zip-')), 'wrong.zip')
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
    zip.addFile(other, 'fotobogen.db')
    zip.end()
    await new Promise(done => zip.outputStream.pipe(createWriteStream(wrong)).on('close', done))
    await expect(applyRestore(paths, wrong)).rejects.toThrow('table "photos" is missing')
    expect(readdirSync(paths.root).sort()).toEqual(before) // no staging folder, nothing moved
  })
})
