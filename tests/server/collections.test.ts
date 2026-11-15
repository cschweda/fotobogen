import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

describe('albums and tags', () => {
  let server: TestServer
  let cookie: string
  const ids: Record<string, string> = {}
  let trip = ''
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = async <T>(path: string) => await (await get(server, path)).json() as T
  const slugs = async (path: string) => (await json<{ tiles: { slug: string }[] }>(path)).tiles.map(tile => tile.slug)

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      const response = await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 300, height: 200 }), `${name}.jpg`)
      ids[name] = (await response.json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('need a logged-in admin to change', async () => {
    expect((await send('POST', '/api/admin/albums', { title: 'x' }, { cookie: '' })).status).toBe(401)
    expect((await get(server, '/api/admin/albums')).status).toBe(401)
  })

  it('creates an album and fills it; the site lists it once it has a photo to show', async () => {
    expect(await json<{ hasAlbums: boolean }>('/api/site')).toMatchObject({ hasAlbums: false })
    const created = await send('POST', '/api/admin/albums', { title: 'Road Trip', description: 'Three days north.' })
    expect(created.status).toBe(201)
    trip = (await created.json() as { id: string, slug: string }).id
    // An empty album is not shown to visitors.
    expect((await json<{ albums: unknown[] }>('/api/albums')).albums).toEqual([])
    expect((await get(server, '/api/albums/road-trip')).status).toBe(404)

    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.b, ids.a], action: 'add-to-album', album: trip })).json()).toEqual({ changed: 2 })
    const { albums } = await json<{ albums: { slug: string, title: string, count: number, cover: { url: string } | null }[] }>('/api/albums')
    expect(albums).toMatchObject([{ slug: 'road-trip', title: 'Road Trip', count: 2 }])
    expect(albums[0]!.cover!.url).toMatch(/-square-/)
    expect(JSON.stringify(albums)).not.toContain(trip) // internal ids stay internal
    expect(await json<{ hasAlbums: boolean }>('/api/site')).toMatchObject({ hasAlbums: true })
    // In the order they were added, not the library's order.
    expect(await slugs('/api/albums/road-trip')).toEqual(['b', 'a'])
    expect(await (await get(server, '/album/road-trip')).text()).toContain('Three days north.')
    expect(await (await get(server, '/albums')).text()).toContain('Road Trip')
    expect(await (await get(server, '/sitemap.xml')).text()).toContain('/album/road-trip')
  })

  it('shows only photos a visitor may see, and hides a hidden album entirely', async () => {
    await send('PATCH', `/api/admin/photos/${ids.b}`, { visibility: 'hidden' })
    expect(await slugs('/api/albums/road-trip')).toEqual(['a'])
    expect((await json<{ albums: { count: number }[] }>('/api/albums')).albums[0]!.count).toBe(1)
    await send('PATCH', `/api/admin/photos/${ids.b}`, { visibility: 'public' })

    await send('PATCH', `/api/admin/albums/${trip}`, { visibility: 'hidden' })
    expect((await get(server, '/api/albums/road-trip')).status).toBe(404)
    expect((await get(server, '/album/road-trip')).status).toBe(404)
    expect((await json<{ albums: { slug: string }[] }>(`/api/photos/a`)).albums).toEqual([])
    // The admin still sees it.
    expect((await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { visibility: string, count: number }[] }).albums).toMatchObject([{ visibility: 'hidden', count: 2 }])
    await send('PATCH', `/api/admin/albums/${trip}`, { visibility: 'public' })
    expect((await json<{ albums: { slug: string, title: string }[] }>(`/api/photos/a`)).albums).toEqual([{ slug: 'road-trip', title: 'Road Trip' }])
  })

  it('tags photos one at a time or several at once, and gives each tag a page', async () => {
    const saved = await send('PATCH', `/api/admin/photos/${ids.a}`, { tags: ['Night', ' street ', 'night'] })
    expect(await saved.json()).toMatchObject({ ok: true, tags: ['Night', 'street'] })
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.b, ids.c], action: 'add-tag', tag: 'Street' })).json()).toEqual({ changed: 2 })
    expect((await send('POST', '/api/admin/photos/bulk', { ids: [ids.b], action: 'add-tag', tag: '!!' })).status).toBe(422)

    expect((await json<{ tags: { slug: string, name: string }[] }>('/api/photos/a')).tags).toEqual([{ slug: 'night', name: 'Night' }, { slug: 'street', name: 'street' }])
    expect(await json<{ tag: { name: string }, total: number }>('/api/tags/street')).toMatchObject({ tag: { name: 'street' }, total: 3 })
    expect(await slugs('/api/tags/night')).toEqual(['a'])
    expect(await (await get(server, '/tag/street')).text()).toContain('3 photos tagged')
    expect((await get(server, '/api/tags/no-such-tag')).status).toBe(404)
    // A tag only hidden photos carry has no public page.
    await send('PATCH', `/api/admin/photos/${ids.a}`, { visibility: 'hidden' })
    expect((await get(server, '/tag/night')).status).toBe(404)
    await send('PATCH', `/api/admin/photos/${ids.a}`, { visibility: 'public' })
  })

  it('sets one photo\'s albums as a whole, and lists an album\'s photos for the admin', async () => {
    const other = (await (await send('POST', '/api/admin/albums', { title: 'Favourites' })).json() as { id: string }).id
    await send('PATCH', `/api/admin/photos/${ids.c}`, { albums: [trip, other] })
    const detail = await (await get(server, `/api/admin/photos/${ids.c}`, { cookie })).json() as { albums: string[], tags: string[] }
    expect(detail.albums.sort()).toEqual([trip, other].sort())
    expect(detail.tags).toEqual(['street'])
    await send('PATCH', `/api/admin/photos/${ids.c}`, { albums: [other] })
    const inTrip = await (await get(server, `/api/admin/photos?album=${trip}`, { cookie })).json() as { photos: { filename: string }[] }
    expect(inTrip.photos.map(photo => photo.filename).sort()).toEqual(['a.jpg', 'b.jpg'])
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'remove-from-album', album: trip })).json()).toEqual({ changed: 1 })
    expect((await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'add-to-album', album: 'no-such-album' })).status).toBe(404)
  })

  it('renames, re-addresses, and deletes an album without touching its photos', async () => {
    expect(await (await send('PATCH', `/api/admin/albums/${trip}`, { title: 'North', slug: 'north' })).json()).toMatchObject({ ok: true, slug: 'north' })
    expect((await get(server, '/album/road-trip')).status).toBe(404)
    expect((await get(server, '/album/north')).status).toBe(200)
    expect((await send('PATCH', `/api/admin/albums/${trip}`, { title: '' })).status).toBe(422)
    expect((await send('PATCH', `/api/admin/albums/${trip}`, { slug: 'favourites' })).status).toBe(409)
    expect((await send('DELETE', `/api/admin/albums/${trip}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/albums/${trip}`)).status).toBe(404)
    expect((await json<{ total: number }>('/api/photos')).total).toBe(3)
  })
})
