import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'
import Database from 'better-sqlite3'

interface Photo { licence: { label: string, url: string | null }, download: { url: string, original: boolean } | null }

describe('licences and downloads', () => {
  let server: TestServer
  let cookie: string
  let id = ''
  let uploaded: Buffer
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const photo = async () => await (await get(server, '/api/photos/harbour')).json() as Photo
  const settings = { siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false }
  const setLocation = (lat: number | null) => {
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.prepare(`update photos set lat = ?, lng = ?`).run(lat, lat === null ? null : 8.54)
    db.close()
  }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    uploaded = await imageBuffer({ seed: 1, width: 1600, height: 1000 })
    const response = await upload(server, cookie, uploaded, 'harbour.jpg')
    id = (await response.json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('publishes photos as all rights reserved, with no download, unless told otherwise', async () => {
    expect(await photo()).toMatchObject({ licence: { label: 'All rights reserved', url: null }, download: null })
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(404)
    expect(await (await get(server, '/photo/harbour')).text()).toContain('All rights reserved')
  })

  it('uses the site\'s licence, which one photo can override', async () => {
    expect((await send('PUT', '/api/admin/settings', { ...settings, licence: 'cc-by' })).status).toBe(200)
    expect((await photo()).licence).toEqual({ label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' })
    await send('PATCH', `/api/admin/photos/${id}`, { license: 'cc0' })
    expect((await photo()).licence.label).toBe('CC0 1.0 (public domain)')
    expect(await (await get(server, '/photo/harbour')).text()).toContain('rel="license"')
    await send('PATCH', `/api/admin/photos/${id}`, { license: null })
    expect((await photo()).licence.label).toBe('CC BY 4.0')
    expect((await send('PATCH', `/api/admin/photos/${id}`, { license: 'my-own-terms' })).status).toBe(422)
    expect((await send('PUT', '/api/admin/settings', { ...settings, licence: 'wtfpl' })).status).toBe(422)
  })

  it('lets visitors download the file exactly as uploaded when the site allows it', async () => {
    await send('PUT', '/api/admin/settings', { ...settings, allowDownload: true })
    expect((await photo()).download).toEqual({ url: '/api/photos/harbour/download', original: true })
    const response = await get(server, '/api/photos/harbour/download')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="harbour.jpg"')
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(Buffer.from(await response.arrayBuffer()).equals(uploaded)).toBe(true)
    expect(await (await get(server, '/photo/harbour')).text()).toContain('Download the original')
  })

  it('lets one photo opt out, or opt in when the site does not allow downloads', async () => {
    await send('PATCH', `/api/admin/photos/${id}`, { allowDownload: false })
    expect((await photo()).download).toBeNull()
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(404)
    await send('PUT', '/api/admin/settings', { ...settings, allowDownload: false })
    await send('PATCH', `/api/admin/photos/${id}`, { allowDownload: true })
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(200)
    await send('PATCH', `/api/admin/photos/${id}`, { allowDownload: null })
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(404)
    expect((await send('PATCH', `/api/admin/photos/${id}`, { allowDownload: 'maybe' })).status).toBe(422)
  })

  it('never hands out a file that records a location the site keeps private', async () => {
    await send('PATCH', `/api/admin/photos/${id}`, { allowDownload: true })
    setLocation(47.37)
    expect((await photo()).download).toEqual({ url: '/api/photos/harbour/download', original: false })
    const copy = await get(server, '/api/photos/harbour/download')
    expect(copy.headers.get('content-type')).toBe('image/webp')
    expect(copy.headers.get('content-disposition')).toBe('attachment; filename="harbour.webp"')
    const meta = await sharp(Buffer.from(await copy.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.exif]).toEqual(['webp', 1600, undefined])
    expect(await (await get(server, '/photo/harbour')).text()).not.toContain('Download the original')
    // With locations shown, the original is fair game again.
    await send('PUT', '/api/admin/settings', { ...settings, showLocation: true })
    expect((await photo()).download!.original).toBe(true)
    expect((await get(server, '/api/photos/harbour/download')).headers.get('content-type')).toBe('image/jpeg')
    await send('PUT', '/api/admin/settings', settings)
    setLocation(null)
  })

  it('refuses downloads of photos visitors may not see', async () => {
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'hidden' })
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(404)
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'public', publishAt: Date.now() + 3_600_000 })
    expect((await get(server, '/api/photos/harbour/download')).status).toBe(404)
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: null })
    expect((await get(server, '/api/photos/no-such-photo/download')).status).toBe(404)
    expect(query(server, 'select allow_download from photos')).toEqual([{ allow_download: 1 }])
    void readFileSync
  })

  it('applies the watermark module to the copies visitors see, not to a downloaded original', async () => {
    await send('PUT', '/api/admin/modules/watermark', { enabled: true })
    await send('PUT', '/api/admin/site-recipe', { recipe: [{ module: 'watermark', transform: 'text-mark', params: { text: 'TEST PHOTOS', opacity: 100, size: 4 } }] })
    await whenProcessed(server, cookie)
    const shown = await (await get(server, '/api/photos/harbour')).json() as { images: { url: string }[] }
    const marked = await sharp(Buffer.from(await (await get(server, shown.images.at(-1)!.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
    const plain = await sharp(uploaded).raw().toBuffer({ resolveWithObject: true })
    // The bottom-right corner differs from the upload; the original download does not.
    const corner = (image: { data: Buffer, info: sharp.OutputInfo }) => image.data.subarray(image.data.length - image.info.width * image.info.channels * 60)
    expect(corner(marked).equals(corner(plain))).toBe(false)
    expect(Buffer.from(await (await get(server, '/api/photos/harbour/download')).arrayBuffer()).equals(uploaded)).toBe(true)
  })
})
