import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Show { title: string | null, back: string, seconds: number, order: string, slides: { slug: string, camera: string | null, size: { width: number, height: number } | null, tags: { slug: string, name: string }[], albums: { slug: string, title: string }[], licence: { label: string, url: string | null }, images: { width: number }[] }[] }

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

  it('gives each slide what its photo page shows: size, tags, public albums and licence, but never a hidden album or a location', async () => {
    await send('PUT', '/api/admin/settings', { ...settings, slideshowOrder: 'sequence' })
    const hidden = (await (await send('POST', '/api/admin/albums', { title: 'Kept Back' })).json() as { id: string }).id
    await send('PATCH', `/api/admin/albums/${hidden}`, { visibility: 'hidden' })
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'add-to-album', album: hidden })
    const secret = (await (await send('POST', '/api/admin/albums', { title: 'Family Only' })).json() as { id: string }).id
    expect((await send('PATCH', `/api/admin/albums/${secret}`, { visibility: 'private' })).status).toBe(200)
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'add-to-album', album: secret })
    await send('PATCH', `/api/admin/photos/${ids.a}`, { tags: ['zebra', 'Dusk'], license: 'cc-by' })
    const a = (await show()).slides.find(slide => slide.slug === 'a')!
    expect(a.size).toEqual({ width: 1600, height: 1000 })
    expect(a.tags).toEqual([{ slug: 'dusk', name: 'Dusk' }, { slug: 'zebra', name: 'zebra' }])
    expect(a.albums).toEqual([{ slug: 'coast', title: 'Coast' }])
    expect(a.licence).toEqual({ label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' })
    const text = await (await get(server, '/api/slideshow')).text()
    expect(text).not.toMatch(/Kept Back|kept-back|Family Only|family-only|"lat"|"lng"|location/)

    // With camera details hidden, the size goes with them; tags, albums and licence stay, as on the photo's page.
    await send('PUT', '/api/admin/settings', { ...settings, showExif: false })
    const quiet = (await show()).slides.find(slide => slide.slug === 'a')!
    expect(quiet).toMatchObject({ camera: null, size: null, albums: [{ slug: 'coast' }], licence: { label: 'CC BY 4.0' } })
    expect(quiet.tags).toHaveLength(2)
    await send('PUT', '/api/admin/settings', settings)
  })

  it('renders a page that is kept out of search engines', async () => {
    const html = await (await get(server, '/slideshow')).text()
    expect(html).toContain('fb-slideshow')
    expect(html).toContain('name="robots" content="noindex"')
    expect((await get(server, '/slideshow?album=no-such-album')).status).toBe(404)
  })
})
