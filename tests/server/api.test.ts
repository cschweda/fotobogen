import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

describe('the public API', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    await upload(server, cookie, await imageBuffer({ seed: 1, width: 600, height: 400 }), 'harbour.jpg')
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  const PUBLIC = ['/api/site', '/api/photos', '/api/photos/harbour', '/api/albums', '/api/slideshow']

  it('lets a script on another site read a photo\'s picture', async () => {
    const { tiles } = await (await get(server, '/api/photos')).json() as { tiles: { thumb: { url: string } }[] }
    const response = await get(server, tiles[0]!.thumb.url, { origin: 'https://elsewhere.example' })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('can be read from a browser on any other site, and says which version of itself it is', async () => {
    for (const path of PUBLIC) {
      const response = await get(server, path, { origin: 'https://elsewhere.example' })
      expect(response.status, path).toBe(200)
      expect(response.headers.get('access-control-allow-origin'), path).toBe('*')
      expect(response.headers.get('x-fotobogen-api'), path).toBe('1')
    }
    const missing = await get(server, '/api/photos/no-such-photo', { origin: 'https://elsewhere.example' })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers a browser\'s preflight question', async () => {
    const response = await fetch(server.url + '/api/photos', { method: 'OPTIONS', headers: { 'origin': 'https://elsewhere.example', 'access-control-request-method': 'GET' } })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS')
  })

  it('opens nothing else: the admin, logging in, and the health check carry no such header', async () => {
    for (const path of ['/api/admin/photos', '/api/auth/me', '/api/health', '/api/admin/backup']) {
      const response = await get(server, path, { origin: 'https://elsewhere.example', cookie })
      expect(response.headers.get('access-control-allow-origin'), path).toBeNull()
    }
    // And it stays read-only: a change from another site is still refused.
    const post = await fetch(server.url + '/api/photos', { method: 'POST', headers: { origin: 'https://elsewhere.example' } })
    expect(post.status).toBe(403)
    expect(post.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('gives every field the documentation promises for a photo', async () => {
    const photo = await (await get(server, '/api/photos/harbour')).json() as Record<string, unknown>
    expect(Object.keys(photo).sort()).toEqual([
      'albums', 'alt', 'description', 'download', 'exif', 'images', 'licence', 'location', 'next', 'placeholder', 'previous', 'size', 'slug', 'tags', 'takenAt', 'title',
    ])
    const list = await (await get(server, '/api/photos')).json() as { tiles: Record<string, unknown>[] }
    expect(Object.keys(list).sort()).toEqual(['page', 'pages', 'tiles', 'total'])
    expect(Object.keys(list.tiles[0]!).sort()).toEqual(['alt', 'placeholder', 'slug', 'span', 'square', 'thumb', 'title'])
    expect(Object.keys(await (await get(server, '/api/site')).json() as object).sort()).toEqual(['brand', 'grid', 'hasAlbums', 'language', 'mode', 'photoView', 'seo', 'skinVersion', 'tagline', 'text', 'title'])
  })
})
