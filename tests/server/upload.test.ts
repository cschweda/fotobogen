import Database from 'better-sqlite3'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { listPhotos, upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('uploading photos', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('requires a logged-in admin', async () => {
    const response = await upload(server, '', await imageBuffer(), 'photo.jpg')
    expect(response.status).toBe(401)
    expect((await get(server, '/api/admin/photos')).status).toBe(401)
    expect(query(server, 'select id from photos')).toEqual([])
  })

  it('requires the request to come from the site itself', async () => {
    const response = await upload(server, cookie, await imageBuffer(), 'photo.jpg', { origin: 'https://evil.example' })
    expect(response.status).toBe(403)
  })

  it('accepts a photo, processes it, and serves the resized copies', async () => {
    const response = await upload(server, cookie, await imageBuffer({ width: 3000, height: 2000, exif: { Make: 'Leica', Model: 'M11' } }), 'Evening Walk.jpg')
    expect(response.status).toBe(200)
    const accepted = await response.json() as { result: string, photo: { id: string, slug: string } }
    expect(accepted).toMatchObject({ result: 'accepted', photo: { slug: 'evening-walk' } })

    const { photos } = await whenProcessed(server, cookie)
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({
      id: accepted.photo.id, filename: 'Evening Walk.jpg', status: 'ready', width: 3000, height: 2000,
      isSample: false, error: null, thumb: { width: 480, height: 320 },
    })
    expect(query(server, 'select camera from photos')).toEqual([{ camera: 'Leica M11' }])
    expect(query(server, 'select kind from derivatives order by kind').map(row => row.kind)).toEqual(['large', 'medium', 'square', 'thumb'])

    const image = await get(server, photos[0]!.thumb!.url)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(image.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 480, 320])

    const health = await (await get(server, '/api/health')).json() as { queue: { depth: number } }
    expect(health.queue.depth).toBe(0)
  })

  it('refuses the same file a second time and names the photo that has it', async () => {
    const bytes = await imageBuffer({ seed: 21 })
    expect((await upload(server, cookie, bytes, 'first.jpg')).status).toBe(200)
    const again = await upload(server, cookie, bytes, 'second.jpg')
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({
      message: 'This photo is already in your library.', result: 'duplicate', existing: { filename: 'first.jpg', slug: 'first' },
    })
    await whenProcessed(server, cookie)
  })

  it('refuses a file that is not a photo, whatever it is called', async () => {
    const before = (await listPhotos(server, cookie)).counts.total
    for (const [bytes, name] of [
      [Buffer.from('#!/bin/sh\necho hello\n'), 'script.jpg'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'drawing.png'],
      [await imageBuffer({ format: 'gif' }), 'animation.jpg'],
    ] as const) {
      const response = await upload(server, cookie, bytes, name)
      expect(response.status, name).toBe(422)
      expect(await response.json()).toMatchObject({ reason: 'not-an-image', message: expect.stringContaining('JPEG, PNG, WebP, TIFF, or AVIF') })
    }
    expect((await listPhotos(server, cookie)).counts.total).toBe(before)
    expect(readdirSync(join(server.dataDir, 'tmp'))).toEqual([])
  })

  it('refuses a request without a file', async () => {
    const empty = await fetch(server.url + '/api/admin/photos', { method: 'POST', headers: { origin: server.url, cookie }, body: new FormData() })
    expect(empty.status).toBe(400)
    const json = await fetch(server.url + '/api/admin/photos', {
      method: 'POST', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: '{}',
    })
    expect(json.status).toBe(400)
  })

  it('only serves resized photos from /media/, nothing else on the disk', async () => {
    for (const path of ['/media/..%2Fsecret', '/media/%2e%2e%2ffotobogen.db', '/media/..%5Csecret', '/media/secret', '/media/nothing-here-00000000.webp', '/media/a/b.webp']) {
      const response = await get(server, path)
      expect(response.status, path).toBe(404)
      expect(await response.text()).not.toContain(readSecret(server))
    }
    const original = query<{ original_path: string }>(server, 'select original_path from photos limit 1')[0]!.original_path
    expect((await get(server, `/media/${original}`)).status).toBe(404)
  })

  it('reports on chosen photos by id, leaving out ids that do not exist', async () => {
    const { photos } = await listPhotos(server, cookie)
    const response = await get(server, `/api/admin/photos?ids=${photos[0]!.id},gone-gone-gone,../x`, { cookie })
    const chosen = await response.json() as { photos: { id: string }[] }
    expect(chosen.photos.map(photo => photo.id)).toEqual([photos[0]!.id])
  })

  it('retries only photos that failed', async () => {
    const { photos } = await listPhotos(server, cookie)
    const retry = (id: string) => fetch(`${server.url}/api/admin/photos/${id}/retry`, { method: 'POST', headers: { origin: server.url, cookie } })
    expect((await retry(photos[0]!.id)).status).toBe(409)
    expect((await retry('no-such-photo')).status).toBe(409)
  })

  it('processes a 40-megapixel JPEG', async () => {
    const big = await sharp({ create: { width: 7800, height: 5200, channels: 3, background: '#8a6f4d' } }).jpeg().toBuffer()
    expect((await upload(server, cookie, big, 'forty-megapixels.jpg')).status).toBe(200)
    const { photos } = await whenProcessed(server, cookie)
    const photo = photos.find(p => p.filename === 'forty-megapixels.jpg')!
    expect(photo).toMatchObject({ status: 'ready', width: 7800, height: 5200 })
    expect(query(server, `select kind, width, height from derivatives where photo_id = '${photo.id}' and kind = 'large'`))
      .toEqual([{ kind: 'large', width: 2560, height: 1707 }])
  })

  it('finishes interrupted work, and clears abandoned uploads, after a restart', async () => {
    await server.stop()
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    const { id } = db.prepare(`select id from photos order by sort_order limit 1`).get() as { id: string }
    db.prepare(`update photos set status = 'processing' where id = ?`).run(id)
    db.prepare(`update jobs set status = 'running' where photo_id = ?`).run(id)
    db.close()
    writeFileSync(join(server.dataDir, 'tmp', 'upload-abandoned'), 'half a photo')

    await server.restart()
    const { photos } = await whenProcessed(server, cookie)
    expect(photos.find(photo => photo.id === id)!.status).toBe('ready')
    // The photo is marked ready a moment before its job is recorded as done, so wait for that.
    await expect.poll(() => query(server, `select status, attempts from jobs where photo_id = '${id}'`), { timeout: 10_000 }).toEqual([{ status: 'done', attempts: 2 }])
    expect(existsSync(join(server.dataDir, 'tmp', 'upload-abandoned'))).toBe(false)
  })
})

function readSecret(server: TestServer): string {
  return readFileSync(join(server.dataDir, 'secret'), 'utf8').trim()
}

describe('upload limits', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer({ env: { MAX_UPLOAD_MB: '1', MAX_MEGAPIXELS: '1' } })
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('refuses a file over the size limit before reading it', async () => {
    const response = await upload(server, cookie, new Uint8Array(2 * 1024 * 1024), 'huge.jpg')
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ message: 'This file is larger than the 1 MB upload limit.' })
  })

  it('stops an upload that turns out to be over the limit when its size was not declared', async () => {
    const boundary = 'fotobogen-test-boundary'
    const head = Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="huge.jpg"\r\ncontent-type: image/jpeg\r\n\r\n`)
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const chunks = [head, ...Array.from({ length: 24 }, () => Buffer.alloc(128 * 1024, 0x41)), tail]
    const response = await fetch(server.url + '/api/admin/photos', {
      method: 'POST',
      headers: { origin: server.url, cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: new ReadableStream({ pull(controller) { const next = chunks.shift(); if (next) controller.enqueue(next); else controller.close() } }),
      duplex: 'half',
    } as RequestInit)
    expect(response.status).toBe(413)
    expect(readdirSync(join(server.dataDir, 'tmp'))).toEqual([])
  })

  it('refuses a photo with more pixels than the limit', async () => {
    const response = await upload(server, cookie, await imageBuffer({ width: 1200, height: 900 }), 'big.jpg')
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ reason: 'too-many-pixels', message: 'This photo is 1.1 megapixels; the limit is 1 megapixel.' })
    expect(query(server, 'select id from photos')).toEqual([])
  })
})
