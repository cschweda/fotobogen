import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Show { title: string | null, back: string, seconds: number, order: string, slides: { slug: string, camera: string | null, images: { width: number }[] }[] }

describe('the slideshow', () => {
  let server: TestServer
  let cookie: string
  const ids: Record<string, string> = {}
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const show = async (query = '') => await (await get(server, `/api/slideshow${query}`)).json() as Show
  const settings = { siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: true }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      const response = await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 1600, height: 1000, exif: { Make: 'Leica', Model: 'M11' } }), `${name}.jpg`)
      ids[name] = (await response.json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('plays every public photo in the library\'s order, eight seconds each, by default', async () => {
    const all = await show()
    expect(all).toMatchObject({ title: null, back: '/', seconds: 8, order: 'sequence' })
    expect(all.slides.map(slide => slide.slug)).toEqual(['c', 'b', 'a'])
    expect(all.slides[0]!.images.map(image => image.width)).toEqual([1280, 1600])
    expect(all.slides[0]!.camera).toBe('Leica M11')
  })

  it('leaves out hidden and scheduled photos, and never gives a location', async () => {
    await send('PATCH', `/api/admin/photos/${ids.b}`, { visibility: 'hidden' })
    await send('PATCH', `/api/admin/photos/${ids.c}`, { publishAt: Date.now() + 3_600_000 })
    expect((await show()).slides.map(slide => slide.slug)).toEqual(['a'])
    await send('PATCH', `/api/admin/photos/${ids.b}`, { visibility: 'public' })
    await send('PATCH', `/api/admin/photos/${ids.c}`, { publishAt: null })
    // Even with locations switched on for photo pages, the slideshow has none.
    await send('PUT', '/api/admin/settings', settings)
    const text = await (await get(server, '/api/slideshow')).text()
    expect(text).not.toMatch(/"lat"|"lng"|location/)
  })

  it('plays one album in the album\'s order, or one tag', async () => {
    const album = (await (await send('POST', '/api/admin/albums', { title: 'Coast' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.a, ids.c], action: 'add-to-album', album })
    await send('PATCH', `/api/admin/photos/${ids.b}`, { tags: ['night'] })
    expect(await show('?album=coast')).toMatchObject({ title: 'Coast', back: '/album/coast', slides: [{ slug: 'a' }, { slug: 'c' }] })
    expect(await show('?tag=night')).toMatchObject({ title: 'night', back: '/tag/night', slides: [{ slug: 'b' }] })
    expect((await get(server, '/api/slideshow?album=no-such-album')).status).toBe(404)
    expect((await get(server, '/api/slideshow?tag=no-such-tag')).status).toBe(404)
  })

  it('follows the timing and order chosen in Settings, and hides camera details when the site does', async () => {
    expect((await send('PUT', '/api/admin/settings', { ...settings, showExif: false, slideshowSeconds: 20, slideshowOrder: 'random' })).status).toBe(200)
    const changed = await show()
    expect(changed).toMatchObject({ seconds: 20, order: 'random' })
    expect(changed.slides.every(slide => slide.camera === null)).toBe(true)
    for (const slideshowSeconds of [1, 500, 2.5, 'fast']) {
      expect((await send('PUT', '/api/admin/settings', { ...settings, slideshowSeconds })).status, String(slideshowSeconds)).toBe(422)
    }
  })

  it('renders a page that is kept out of search engines', async () => {
    const html = await (await get(server, '/slideshow')).text()
    expect(html).toContain('fb-slideshow')
    expect(html).toContain('name="robots" content="noindex"')
    expect((await get(server, '/slideshow?album=no-such-album')).status).toBe(404)
  })
})
