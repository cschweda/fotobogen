import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface AdminAlbum { id: string, slug: string, title: string, visibility: string, count: number, privateLink: string | null }
interface Shown { album: { title: string, description: string | null, count: number }, total: number, tiles: { slug: string }[] }

describe('private albums', () => {
  let server: TestServer
  let cookie: string
  let album: string
  let link: string
  const ids: Record<string, string> = {}
  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, { method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const albums = async (headers: Record<string, string> = { cookie }) => (await (await get(server, '/api/admin/albums', headers)).json() as { albums: AdminAlbum[] }).albums
  const text = async (path: string) => await (await get(server, path)).text()

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['bride', 'groom', 'cake', 'street'].entries()) {
      ids[name] = (await (await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 600, height: 400 }), `${name}.jpg`)).json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
    // A client's photos are kept off the site; one of them is public as well.
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.bride, ids.groom], action: 'hide' })
    await send('PATCH', `/api/admin/photos/${ids.bride}`, { title: 'The bride', description: 'Before the ceremony.', tags: ['wedding'] })
    album = (await (await send('POST', '/api/admin/albums', { title: 'Anna and Ben', description: 'Your wedding photographs.' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.bride, ids.groom, ids.cake], action: 'add-to-album', album })
  })
  afterAll(() => server.stop())

  it('gives an album made private a link of its own that cannot be guessed', async () => {
    expect((await albums())[0]).toMatchObject({ visibility: 'public', privateLink: null })
    expect((await send('PATCH', `/api/admin/albums/${album}`, { visibility: 'private' })).status).toBe(200)
    const [made] = await albums()
    expect(made).toMatchObject({ visibility: 'private', count: 3 })
    expect(made!.privateLink).toMatch(/^\/private\/[A-Za-z0-9_-]{32}$/)
    link = made!.privateLink!
  })

  it('shows the album at that link, hidden photos included, and nothing of it anywhere else', async () => {
    const shown = await (await get(server, `/api${link}`)).json() as Shown
    expect(shown.album).toEqual({ title: 'Anna and Ben', description: 'Your wedding photographs.', count: 3 })
    expect(shown.tiles.map(tile => tile.slug)).toEqual(['bride', 'groom', 'cake'])
    const html = await text(link)
    expect(html).toContain('Anna and Ben')
    expect(html).toContain(`${link}/photo/bride`)
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/)

    // Not in the albums, the grid, search, the feed, the sitemap, or the public API.
    expect(await (await get(server, '/api/albums')).json()).toEqual({ albums: [] })
    expect((await get(server, '/album/anna-and-ben')).status).toBe(404)
    expect((await get(server, '/api/albums/anna-and-ben')).status).toBe(404)
    expect((await get(server, '/api/slideshow?album=anna-and-ben')).status).toBe(404)
    expect((await (await get(server, '/api/photos')).json() as Shown).tiles.map(tile => tile.slug).sort()).toEqual(['cake', 'street'])
    expect((await (await get(server, '/api/search?q=anna')).json() as Shown).total).toBe(0)
    expect((await (await get(server, '/api/search?q=bride')).json() as Shown).total).toBe(0)
    for (const path of ['/', '/albums', '/feed.xml', '/sitemap.xml', '/api/site']) {
      const body = await text(path)
      expect(body, path).not.toContain('Anna')
      expect(body, path).not.toContain(link.slice(-32))
    }
    // The public photo in it does not point to the private album.
    expect(await (await get(server, '/api/photos/cake')).json()).toMatchObject({ albums: [] })
  })

  it('shows each photo of the album at the link, and no other photo', async () => {
    const bride = await (await get(server, `/api${link}/photos/bride`)).json() as Record<string, unknown>
    expect(bride).toMatchObject({ slug: 'bride', title: 'The bride', description: 'Before the ceremony.', previous: null, next: 'groom', download: null, location: null, tags: [], albums: [] })
    expect((bride.images as unknown[]).length).toBeGreaterThan(0)
    expect(await (await get(server, `/api${link}/photos/groom`)).json()).toMatchObject({ previous: 'bride', next: 'cake' })
    expect(await text(`${link}/photo/bride`)).toContain('The bride')
    // Still nothing at the hidden photo's ordinary address.
    expect((await get(server, '/photo/bride')).status).toBe(404)
    expect((await get(server, '/api/photos/bride')).status).toBe(404)
    // A photo that is not in the album cannot be reached through its link.
    expect((await get(server, `/api${link}/photos/street`)).status).toBe(404)
    expect((await get(server, `${link}/photo/street`)).status).toBe(404)
  })

  it('leaves out a photo in the trash or not yet processed', async () => {
    await send('DELETE', `/api/admin/photos/${ids.groom}`)
    const shown = await (await get(server, `/api${link}`)).json() as Shown
    expect(shown.tiles.map(tile => tile.slug)).toEqual(['bride', 'cake'])
    expect((await get(server, `/api${link}/photos/groom`)).status).toBe(404)
    await send('POST', `/api/admin/photos/${ids.groom}/restore`)
    await whenProcessed(server, cookie)
  })

  it('answers "not found" for a wrong link, and tells browsers and proxies to keep nothing', async () => {
    for (const wrong of ['/private/' + 'A'.repeat(32), '/private/x', `${link.slice(0, -1)}_`, '/private/' + link.slice(9).toUpperCase(), '/private']) {
      expect((await get(server, wrong)).status, wrong).toBe(404)
      if (wrong !== '/private') expect((await get(server, `/api${wrong}`)).status, wrong).toBe(404)
    }
    for (const path of [link, `/api${link}`, `${link}/photo/bride`, `/api${link}/photos/bride`]) {
      const response = await get(server, path, { origin: 'https://elsewhere.example' })
      expect(response.headers.get('cache-control'), path).toBe('private, no-store')
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
      // Not offered to scripts on other sites, unlike the public API.
      expect(response.headers.get('access-control-allow-origin'), path).toBeNull()
      // The link is not passed on to sites the page links to.
      expect(response.headers.get('referrer-policy'), path).toBe('no-referrer')
    }
  })

  it('never puts a counting script on a private page', async () => {
    await send('PUT', '/api/admin/stats', { provider: 'plausible', plausibleScript: 'https://plausible.io/js/pa-AbC123.js' })
    expect(await text('/')).toContain('plausible')
    expect(await text(link)).not.toContain('plausible')
    expect(await text(`${link}/photo/bride`)).not.toContain('plausible')
    await send('PUT', '/api/admin/stats', { provider: 'off' })
  })

  it('makes a new link on request, which ends the old one; and ends the link when the album stops being private', async () => {
    expect((await send('PATCH', `/api/admin/albums/${album}`, { newPrivateLink: true })).status).toBe(200)
    const fresh = (await albums())[0]!.privateLink!
    expect(fresh).not.toBe(link)
    expect((await get(server, link)).status).toBe(404)
    expect((await get(server, fresh)).status).toBe(200)

    await send('PATCH', `/api/admin/albums/${album}`, { visibility: 'hidden' })
    expect((await albums())[0]).toMatchObject({ visibility: 'hidden', privateLink: null })
    expect((await get(server, fresh)).status).toBe(404)
    expect((await get(server, `/api${fresh}`)).status).toBe(404)
    // A new link is not made for an album that is not private.
    expect((await send('PATCH', `/api/admin/albums/${album}`, { newPrivateLink: true })).status).toBe(422)
    // Private again: another link, never the old one.
    await send('PATCH', `/api/admin/albums/${album}`, { visibility: 'private' })
    link = (await albums())[0]!.privateLink!
    expect(link).not.toBe(fresh)
    expect((await send('PATCH', `/api/admin/albums/${album}`, { visibility: 'secret' })).status).toBe(422)
  })

  it('does not show the link to a demo visitor', async () => {
    const demo = await startServer({ env: { DEMO_MODE: '1' } })
    try {
      const owner = await completeSetup(demo)
      const made = (await (await fetch(`${demo.url}/api/admin/albums`, { method: 'POST', headers: { origin: demo.url, cookie: owner, 'content-type': 'application/json' }, body: '{"title":"Clients"}' })).json() as { id: string }).id
      await fetch(`${demo.url}/api/admin/albums/${made}`, { method: 'PATCH', headers: { origin: demo.url, cookie: owner, 'content-type': 'application/json' }, body: '{"visibility":"private"}' })
      const login = await fetch(`${demo.url}/api/auth/login`, { method: 'POST', headers: { 'origin': demo.url, 'content-type': 'application/json' }, body: '{"username":"demo","password":"demo"}' })
      const visitor = login.headers.getSetCookie()[0]!.split(';')[0]!
      const seen = await (await fetch(`${demo.url}/api/admin/albums`, { headers: { cookie: visitor } })).json() as { albums: AdminAlbum[] }
      expect(seen.albums[0]).toMatchObject({ visibility: 'private', privateLink: null })
      expect(JSON.stringify(seen)).not.toMatch(/\/private\//)
    }
    finally {
      await demo.stop()
    }
  })
})
