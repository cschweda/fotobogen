import Database from 'better-sqlite3'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { applyRestore, inspectBackup, writeBackup } from '../../server/core/backup.ts'
import { dataPaths } from '../../server/core/paths.ts'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { createAlbum, addToAlbum, setPhotoTags } from '../../server/pipeline/collections.ts'
import { updatePhoto } from '../../server/pipeline/library.ts'
import { processPhoto } from '../../server/pipeline/render.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

const KNOWN = ['0000_initial', '0001_albums_and_tags', '0002_scheduled_publishing', '0003_licence_and_download', '0004_api_tokens']

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
    expect(await inspectBackup(file, KNOWN)).toEqual({ ok: true, manifest })
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
