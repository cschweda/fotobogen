import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { baseEnv, get, post, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

const temp = () => mkdtempSync(join(tmpdir(), 'fb-backup-test-'))
const cli = (dataDir: string, args: string[], home = temp()) => {
  const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', ...args], { env: { ...baseEnv(), DATA_DIR: dataDir, HOME: home, USERPROFILE: home }, encoding: 'utf8' })
  return { code: result.status, out: result.stdout + result.stderr }
}

describe('backup and restore', () => {
  let source: TestServer
  let cookie: string
  let backup: Buffer
  beforeAll(async () => {
    source = await startServer()
    cookie = await completeSetup(source, { siteTitle: 'The Original' })
    for (const [seed, name] of [[1, 'harbour.jpg'], [2, 'tower.jpg']] as const) {
      await upload(source, cookie, await imageBuffer({ seed, width: 400, height: 300 }), name)
    }
    await whenProcessed(source, cookie)
    await fetch(`${source.url}/api/admin/albums`, { method: 'POST', headers: { origin: source.url, cookie, 'content-type': 'application/json' }, body: '{"title":"Coast"}' })
  })
  afterAll(() => source.stop())

  it('downloads a backup as a zip, for a logged-in admin only', async () => {
    expect((await get(source, '/api/admin/backup')).status).toBe(401)
    const response = await get(source, '/api/admin/backup', { cookie })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="fotobogen-backup-\d{4}-\d\d-\d\d\.zip"$/)
    backup = Buffer.from(await response.arrayBuffer())
    expect(backup.subarray(0, 2).toString()).toBe('PK')
    expect(backup.includes('harbour.jpg')).toBe(false) // files are stored under their ids, not the names they were uploaded with
  })

  it('reports what is stored on the System page\'s endpoint', async () => {
    const system = await (await get(source, '/api/admin/system', { cookie })).json() as Record<string, number | boolean>
    expect(system).toMatchObject({ photos: 2, queueDepth: 0, restorePending: false })
    expect(system.originalsBytes).toBeGreaterThan(0)
    expect(system.derivativesBytes).toBeGreaterThan(0)
  })

  it('restores into another site after a restart: photos, albums, settings, and login', async () => {
    const target = await startServer()
    try {
      const targetCookie = await completeSetup(target, { siteTitle: 'The Other Site', username: 'someone-else' })
      await upload(target, targetCookie, await imageBuffer({ seed: 9, width: 300, height: 300 }), 'will-be-replaced.jpg')
      await whenProcessed(target, targetCookie)
      const send = (method: string, body?: BodyInit) => fetch(`${target.url}/api/admin/restore`, { method, headers: { origin: target.url, cookie: targetCookie, 'content-type': 'application/zip' }, body })

      // Something that is not a backup is refused and nothing is staged.
      expect((await send('PUT', 'this is not a zip')).status).toBe(422)
      expect((await send('PUT', new Uint8Array(backup))).status).toBe(200)
      expect(await (await get(target, '/api/admin/system', { cookie: targetCookie })).json()).toMatchObject({ restorePending: true, photos: 1 })
      // It can be called off...
      expect((await send('DELETE')).status).toBe(200)
      expect(existsSync(join(target.dataDir, 'restore-pending.zip'))).toBe(false)
      // ...and nothing changes until the restart.
      expect((await send('PUT', new Uint8Array(backup))).status).toBe(200)
      expect(query(target, 'select count(*) as n from photos')).toEqual([{ n: 1 }])

      await target.restart()
      expect(target.output()).toContain('Restored a backup with 2 photos.')
      const login = await post(target, '/api/auth/login', ADMIN)
      expect(login.status).toBe(200) // the backup's login, not "someone-else"
      const restoredCookie = login.headers.getSetCookie()[0]!.split(';')[0]!
      const { photos } = await whenProcessed(target, restoredCookie)
      expect(photos.map(photo => [photo.filename, photo.status]).sort()).toEqual([['harbour.jpg', 'ready'], ['tower.jpg', 'ready']])
      expect(await (await get(target, '/api/site')).json()).toMatchObject({ title: 'The Original' })
      expect(query(target, 'select title from albums')).toEqual([{ title: 'Coast' }])
      expect((await get(target, photos[0]!.thumb!.url)).status).toBe(200)
      // What was there before is kept, not deleted.
      const kept = readdirSync(target.dataDir).find(name => name.startsWith('before-restore-'))!
      expect(readdirSync(join(target.dataDir, kept, 'originals'))).toHaveLength(1)
      expect(existsSync(join(target.dataDir, 'restore-pending.zip'))).toBe(false)
    }
    finally {
      await target.stop()
    }
  })

  it('backs up and restores from the command line', async () => {
    const file = join(temp(), 'site.zip')
    const made = cli(source.dataDir, ['backup', file])
    expect(made.out).toMatch(/Backup written to .*site\.zip: 2 photos/)
    expect(made.code).toBe(0)

    const fresh = join(temp(), 'data')
    const restored = cli(fresh, ['restore', file])
    expect(restored.out).toContain('Restored 2 photos from a backup made')
    expect(restored.code).toBe(0)
    expect(readdirSync(join(fresh, 'originals'))).toHaveLength(2)

    const server = await startServer({ dataDir: fresh })
    try {
      const login = await post(server, '/api/auth/login', ADMIN)
      const { photos } = await whenProcessed(server, login.headers.getSetCookie()[0]!.split(';')[0]!)
      expect(photos.every(photo => photo.status === 'ready')).toBe(true)
    }
    finally {
      await server.stop()
    }
  })

  it('refuses, from the command line, a file that is not a backup or is missing', () => {
    const junk = join(temp(), 'junk.zip')
    writeFileSync(junk, 'not a zip')
    const data = join(temp(), 'data')
    expect(cli(data, ['restore', junk])).toMatchObject({ code: 1, out: expect.stringContaining('not a zip archive') })
    expect(cli(data, ['restore', join(temp(), 'nothing.zip')])).toMatchObject({ code: 1, out: expect.stringContaining('There is no file') })
    expect(cli(data, ['restore'])).toMatchObject({ code: 1, out: expect.stringContaining('Say which backup') })
    expect(existsSync(join(data, 'fotobogen.db'))).toBe(false)
    expect(cli(data, ['backup'])).toMatchObject({ code: 1, out: expect.stringContaining('No Fotobogen database') })
  })

  it('still starts, with its own data, when a staged restore turns out to be unusable', async () => {
    const yazl = (await import('yazl')).default
    const { createWriteStream } = await import('node:fs')
    const server = await startServer()
    try {
      const own = await completeSetup(server, { siteTitle: 'Still Here' })
      await server.stop()
      // A file that passes for a backup at upload time but holds no real database.
      const manifest = { format: 1, app: 'fotobogen', appVersion: '0.1.0', createdAt: 'x', migrations: ['0000_initial'], photos: 0, originalsBytes: 0 }
      const zip = new yazl.ZipFile()
      zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
      zip.addBuffer(Buffer.from('not a database'), 'fotobogen.db')
      zip.end()
      await new Promise(done => zip.outputStream.pipe(createWriteStream(join(server.dataDir, 'restore-pending.zip'))).on('close', done))

      await server.restart()
      expect(server.output()).toContain('The backup could not be restored')
      expect(server.output()).toContain('Nothing was changed.')
      expect(await (await get(server, '/api/site')).json()).toMatchObject({ title: 'Still Here' })
      expect((await get(server, '/api/admin/overview', { cookie: own })).status).toBe(200)
      const left = readdirSync(server.dataDir)
      expect(left).not.toContain('restore-pending.zip')
      expect(left.some(name => name.startsWith('restore-failed-'))).toBe(true)
      expect(left.some(name => name.startsWith('before-restore-'))).toBe(false)
      // And it keeps starting.
      await server.restart()
      expect((await get(server, '/api/health')).status).toBe(200)
    }
    finally {
      await server.stop()
    }
  })
})
