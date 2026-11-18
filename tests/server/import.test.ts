// `fotobogen import <folder>`: bring a folder of photos into a running site.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer, withEmbeddedText } from '../helpers/images.ts'
import { whenProcessed } from '../helpers/photos.ts'
import { baseEnv, get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

function cli(dataDir: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', ...args], { env: { ...baseEnv(), DATA_DIR: dataDir, ...env }, encoding: 'utf8' })
  return { code: result.status, out: result.stdout + result.stderr }
}
/** The same, without stopping this process while it runs: for when the command talks to a listener made here. */
function cliAsync(dataDir: string, args: string[]): Promise<{ code: number | null, out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['scripts/fotobogen.mjs', ...args], { env: { ...baseEnv(), DATA_DIR: dataDir } })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { out += chunk })
    child.on('close', code => done({ code, out }))
  })
}

describe('fotobogen import', () => {
  let server: TestServer
  let cookie: string
  let folder: string
  const albums = async () => (await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { title: string, count: number }[] }).albums.map(album => [album.title, album.count]).sort()
  const tokens = () => query(server, 'select name from api_tokens')

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    folder = mkdtempSync(join(tmpdir(), 'fb-import-'))
    mkdirSync(join(folder, 'Iceland 2023'))
    mkdirSync(join(folder, '.thumbnails'))
    writeFileSync(join(folder, 'green-bicycle.jpg'), await imageBuffer({ seed: 1, width: 600, height: 400 }))
    writeFileSync(join(folder, 'Iceland 2023', 'falls.JPG'), withEmbeddedText(await imageBuffer({ seed: 2, width: 600, height: 400 }), { xmp: { title: 'Skógafoss', keywords: ['waterfall'] } }))
    copyFileSync('tests/fixtures/iphone.heic', join(folder, 'Iceland 2023', 'IMG_0042.HEIC'))
    // What is not a photo, or not meant to be found, is left alone.
    writeFileSync(join(folder, 'notes.txt'), 'not a photo')
    writeFileSync(join(folder, '.hidden.jpg'), await imageBuffer({ seed: 3 }))
    writeFileSync(join(folder, '.thumbnails', 'thumb.jpg'), await imageBuffer({ seed: 4 }))
    writeFileSync(join(folder, 'broken.jpg'), 'this only claims to be a photo')
    const outside = mkdtempSync(join(tmpdir(), 'fb-outside-'))
    writeFileSync(join(outside, 'elsewhere.jpg'), await imageBuffer({ seed: 5 }))
    try { symlinkSync(join(outside, 'elsewhere.jpg'), join(folder, 'link.jpg')) }
    catch { /* Windows without the right to make links: nothing to skip */ }
    // A second name for a file that lives elsewhere (a hard link) is not followed either.
    writeFileSync(join(outside, 'private.jpg'), await imageBuffer({ seed: 6 }))
    try { linkSync(join(outside, 'private.jpg'), join(folder, 'hard.jpg')) }
    catch { /* a filesystem without hard links */ }
  })
  afterAll(() => server.stop())

  it('uploads every photo in the folder and the folders inside it, waits for them, and reports what it could not take', async () => {
    const result = cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(result.out).toContain('3 added, 0 already in the library, 2 refused')
    expect(result.out).toMatch(/hard\.jpg: left alone, because it is a link/)
    expect(result.out).toMatch(/broken\.jpg: This file is not a photo Fotobogen can read/)
    expect(result.out).not.toMatch(/notes\.txt|hidden|thumb\.jpg|elsewhere/)
    expect(query(server, `select count(*) as linked from photos where original_filename = 'hard.jpg'`)).toEqual([{ linked: 0 }])
    expect(result.code).toBe(1) // something was refused
    const { photos } = await whenProcessed(server, cookie)
    expect(photos.map(photo => [photo.filename, photo.status]).sort()).toEqual([['IMG_0042.HEIC', 'ready'], ['falls.JPG', 'ready'], ['green-bicycle.jpg', 'ready']])
    // The words inside a file come with it, as for any upload.
    expect(query(server, `select title from photos where original_filename = 'falls.JPG'`)).toEqual([{ title: 'Skógafoss' }])
    // The pass it made for itself is gone again.
    expect(tokens()).toEqual([])
  })

  it('skips what is already in the library when run again', () => {
    const result = cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(result.out).toContain('0 added, 3 already in the library, 2 refused')
    expect(query(server, 'select count(*) as photos from photos')).toEqual([{ photos: 3 }])
  })

  it('makes an album of each folder inside, or puts everything in one album, photos already here included', async () => {
    expect(cli(server.dataDir, ['import', folder, '--url', server.url, '--albums']).out).toContain('Album "Iceland 2023": 2 photos')
    expect(await albums()).toEqual([['Iceland 2023', 2]])
    expect(cli(server.dataDir, ['import', folder, '--url', server.url, '--album', 'Everything']).out).toContain('Album "Everything": 3 photos')
    // The same album is used again, not made twice.
    cli(server.dataDir, ['import', folder, '--url', server.url, '--albums'])
    expect(await albums()).toEqual([['Everything', 3], ['Iceland 2023', 2]])
    expect(tokens()).toEqual([])
  })

  it('says plainly when the site is not running, or is not the site this data folder belongs to', async () => {
    const stopped = cli(server.dataDir, ['import', folder, '--url', 'http://127.0.0.1:9'])
    expect(stopped.code).toBe(1)
    expect(stopped.out).toContain('Fotobogen is not running at http://127.0.0.1:9')
    expect(tokens()).toEqual([])

    const other = await startServer()
    try {
      await completeSetup(other)
      const wrong = cli(server.dataDir, ['import', folder, '--url', other.url])
      expect(wrong.code).toBe(1)
      expect(wrong.out).toContain('is not the site whose data is in')
      expect(query(other, 'select count(*) as photos from photos')).toEqual([{ photos: 0 }])
    }
    finally { await other.stop() }
    expect(tokens()).toEqual([])
  })

  it('needs a folder that exists, and an address on this machine unless told otherwise', () => {
    expect(cli(server.dataDir, ['import']).out).toContain('Usage: fotobogen import <folder>')
    expect(cli(server.dataDir, ['import', join(folder, 'no-such-folder'), '--url', server.url]).out).toContain('is not a folder')
    const far = cli(server.dataDir, ['import', folder, '--url', 'https://photos.example.com'])
    expect(far.code).toBe(1)
    expect(far.out).toContain('only talks to a site on this machine')
    expect(tokens()).toEqual([])
  })

  it('gives its pass to nobody but the site itself: not to another program listening where the site was expected, even one that passes the questions on', async () => {
    // Found by the audit of 18 November 2026: the pass went out with the very first request, to whoever answered.
    const seen: IncomingHttpHeaders[] = []
    const site = new URL(server.url)
    // Answers everything itself, as a program pretending to be the site would.
    const pretender = createServer((request, response) => {
      seen.push(request.headers)
      response.setHeader('content-type', 'application/json')
      response.end('{"photos":[],"answer":"0000"}')
    })
    // Passes every question on to the real site and hands back its answer.
    const relay = createServer((request, response) => {
      seen.push(request.headers)
      httpRequest({ host: site.hostname, port: site.port, path: request.url, method: request.method, headers: { ...request.headers, host: site.host } }, (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(response)
      }).end()
    })
    for (const listener of [pretender, relay]) {
      await new Promise<void>(done => listener.listen(0, '127.0.0.1', done))
      const port = (listener.address() as { port: number }).port
      const result = await cliAsync(server.dataDir, ['import', folder, '--url', `http://127.0.0.1:${port}`])
      listener.close()
      expect(result.code).toBe(1)
      expect(result.out).toContain('is not the site whose data is in')
    }
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.filter(headers => headers.authorization)).toEqual([])
    expect(tokens()).toEqual([])
  })

  it('removes only its own pass, and a pass left behind by a run that was killed stops working by itself', async () => {
    // A token of the owner's, even one with a name like the command's own, is not touched.
    const made = await fetch(server.url + '/api/admin/tokens', { method: 'POST', headers: { 'content-type': 'application/json', origin: server.url, cookie }, body: JSON.stringify({ name: 'fotobogen import (temporary)', scope: 'upload' }) })
    expect(made.status).toBe(200)
    cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(tokens()).toEqual([{ name: 'fotobogen import (temporary)' }])

    // A pass from a run that was killed twelve hours ago: the site refuses it, and the next run clears it away.
    const left = 'fb_' + 'x'.repeat(43)
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.pragma('busy_timeout = 5000')
    const name = (age: string) => `fotobogen import: a pass for one run, removed when it ends (${age})`
    const add = (id: string, token: string, age: string, createdAt: number) => db.prepare(`insert into api_tokens (id, name, token_hash, prefix, scope, created_at) values (?, ?, ?, ?, 'manage', ?)`).run(id, name(age), createHash('sha256').update(token).digest('hex'), token.slice(0, 9), createdAt)
    add('old-pass', left, 'old', Date.now() - 13 * 3600_000)
    add('new-pass', 'fb_' + 'y'.repeat(43), 'new', Date.now())
    db.close()
    const use = (token: string) => fetch(server.url + '/api/admin/photos', { headers: { authorization: `Bearer ${token}` } })
    expect((await use(left)).status).toBe(401)
    expect((await use('fb_' + 'y'.repeat(43))).status).toBe(200) // a run that is still going is left alone
    cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(tokens().map(row => row.name).sort()).toEqual(['fotobogen import (temporary)', name('new')])
  })
})
