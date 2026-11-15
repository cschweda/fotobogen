import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('scheduled publishing and drafts', () => {
  let server: TestServer
  let cookie: string
  let id = ''
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const publicSlugs = async () => (await (await get(server, '/api/photos')).json() as { tiles: { slug: string }[] }).tiles.map(tile => tile.slug)
  const listed = async (show = '') => (await (await get(server, `/api/admin/photos?show=${show}`, { cookie })).json() as { photos: { filename: string, hidden: boolean, scheduledFor: number | null }[] }).photos
  const HOUR = 3_600_000

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    const response = await upload(server, cookie, await imageBuffer({ seed: 1, width: 300, height: 200 }), 'first.jpg')
    id = (await response.json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('keeps a scheduled photo off the site, the feed, and the sitemap until its time', async () => {
    expect(await publicSlugs()).toEqual(['first'])
    const later = Date.now() + HOUR
    expect((await send('PATCH', `/api/admin/photos/${id}`, { publishAt: later })).status).toBe(200)
    expect(await publicSlugs()).toEqual([])
    expect((await get(server, '/photo/first')).status).toBe(404)
    expect((await get(server, '/api/photos/first')).status).toBe(404)
    for (const path of ['/feed.xml', '/sitemap.xml']) expect(await (await get(server, path)).text()).not.toContain('/photo/first')
    // The admin sees it, marked as scheduled.
    expect(await listed()).toMatchObject([{ filename: 'first.jpg', hidden: false, scheduledFor: later }])
    expect(await listed('scheduled')).toHaveLength(1)
    expect(await (await get(server, `/api/admin/photos/${id}`, { cookie })).json()).toMatchObject({ visibility: 'public', publishAt: later })
  })

  it('shows it by itself once the time has passed, dated from when it went live', async () => {
    const past = Date.now() - HOUR
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: past })
    expect(await publicSlugs()).toEqual(['first'])
    expect(await listed()).toMatchObject([{ scheduledFor: null }])
    expect(await listed('scheduled')).toEqual([])
    expect(await (await get(server, '/feed.xml')).text()).toContain(`<pubDate>${new Date(past).toUTCString()}</pubDate>`)
  })

  it('publishes at once when the schedule is cleared, and refuses a time that is not one', async () => {
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: Date.now() + HOUR })
    expect(await publicSlugs()).toEqual([])
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: null })
    expect(await publicSlugs()).toEqual(['first'])
    const invalid = await send('PATCH', `/api/admin/photos/${id}`, { publishAt: 'next tuesday' })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toMatchObject({ errors: { publishAt: 'This is not a date and time.' } })
  })

  it('a hidden photo stays hidden whatever its schedule says', async () => {
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'hidden', publishAt: Date.now() - HOUR })
    expect(await publicSlugs()).toEqual([])
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'public', publishAt: null })
  })

  it('can make new uploads start as drafts', async () => {
    const settings = { siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false }
    expect((await send('PUT', '/api/admin/settings', { ...settings, newUploads: 'hidden' })).status).toBe(200)
    expect(await (await get(server, '/api/admin/settings', { cookie })).json()).toMatchObject({ newUploads: 'hidden' })
    await upload(server, cookie, await imageBuffer({ seed: 2, width: 300, height: 200 }), 'draft.jpg')
    await whenProcessed(server, cookie)
    expect(query(server, `select visibility from photos where original_filename = 'draft.jpg'`)).toEqual([{ visibility: 'hidden' }])
    expect(await publicSlugs()).toEqual(['first'])
    // Leaving the setting out keeps uploads public, as before.
    expect((await send('PUT', '/api/admin/settings', settings)).status).toBe(200)
    await upload(server, cookie, await imageBuffer({ seed: 3, width: 300, height: 200 }), 'open.jpg')
    await whenProcessed(server, cookie)
    expect(await publicSlugs()).toEqual(['open', 'first'])
    expect((await send('PUT', '/api/admin/settings', { ...settings, newUploads: 'sometimes' })).status).toBe(422)
  })

  it('counts only photos that are live toward an album and a tag', async () => {
    const album = (await (await send('POST', '/api/admin/albums', { title: 'Soon' })).json() as { id: string }).id
    await send('PATCH', `/api/admin/photos/${id}`, { albums: [album], tags: ['soon'], publishAt: Date.now() + HOUR })
    expect((await get(server, '/api/albums/soon')).status).toBe(404)
    expect((await get(server, '/api/tags/soon')).status).toBe(404)
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: null })
    expect((await get(server, '/api/albums/soon')).status).toBe(200)
    expect((await get(server, '/api/tags/soon')).status).toBe(200)
  })
})
