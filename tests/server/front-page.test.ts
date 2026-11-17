import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, post, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, setupAnswers } from '../helpers/setup.ts'

interface Site { homeOrder: string, frontAlbums: { slug: string, title: string }[] }
interface List { total: number, pages: number, tiles: { slug: string }[] }

describe('the front page: order, and choosing an album', () => {
  let server: TestServer
  let cookie: string
  const ids: string[] = []
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const site = async () => await (await get(server, '/api/site')).json() as Site
  const slugs = async (query = '') => (await (await get(server, `/api/photos${query}`)).json() as List).tiles.map(tile => tile.slug)
  const SETTINGS = { siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false }
  const album = async (title: string, more: Record<string, unknown> = {}) => (await (await send('POST', '/api/admin/albums', { title, ...more })).json() as { id: string }).id

  beforeAll(async () => {
    server = await startServer()
    // Set up as a new site is, without the test helper's choice of order.
    const response = await post(server, '/api/setup/complete', setupAnswers(server))
    cookie = response.headers.getSetCookie()[0]!.split(';')[0]!
    await fetch(server.url + '/api/admin/acknowledge', { method: 'POST', headers: { origin: server.url, cookie } })
    for (let n = 1; n <= 40; n++) {
      ids.push((await (await upload(server, cookie, await imageBuffer({ seed: n, width: 300, height: 200 }), `p${String(n).padStart(2, '0')}.jpg`)).json() as { photo: { id: string } }).photo.id)
    }
    await whenProcessed(server, cookie, 180_000)
  }, 240_000)
  afterAll(() => server.stop())

  it('shows a new site\'s photos in a random order, the same for every page of one visit and different for the next', async () => {
    expect(await site()).toMatchObject({ homeOrder: 'random', frontAlbums: [] })
    const inOrder = await slugs()
    expect(inOrder[0]).toBe('p40') // the API's own order is the library's, whatever the site shows
    const first = [...await slugs('?order=random&seed=7'), ...await slugs('?order=random&seed=7&page=2')]
    const again = [...await slugs('?order=random&seed=7'), ...await slugs('?order=random&seed=7&page=2')]
    const other = [...await slugs('?order=random&seed=8'), ...await slugs('?order=random&seed=8&page=2')]
    expect(first).toEqual(again)
    expect(first).not.toEqual(other)
    // Every photo once, none twice, across the pages.
    expect(first).toHaveLength(40)
    expect(new Set(first).size).toBe(40)
    expect([...first].sort()).toEqual([...inOrder, ...await slugs('?page=2')].sort())
    expect(first.slice(0, 30)).not.toEqual(inOrder)
    // The home page asks for a shuffle of its own each time it is opened.
    const orders = new Set<string>()
    for (let visit = 0; visit < 4; visit++) {
      const html = await (await get(server, '/')).text()
      const shown = [...html.matchAll(/class="fb-tile__link" href="\/photo\/(p\d\d)"/g)].map(found => found[1])
      expect(shown).toHaveLength(30)
      orders.add(shown.join(' '))
    }
    expect(orders.size).toBeGreaterThan(1)
    expect(orders.has(inOrder.join(' '))).toBe(false)
    // A seed that is not a number is refused, not guessed at.
    expect((await get(server, '/api/photos?order=random&seed=abc')).status).toBe(400)
    expect((await get(server, '/api/photos?order=sideways')).status).toBe(400)
  })

  it('can be set to the library\'s order instead', async () => {
    expect((await send('PUT', '/api/admin/settings', { ...SETTINGS, homeOrder: 'sequence' })).status).toBe(200)
    expect(await site()).toMatchObject({ homeOrder: 'sequence' })
    expect(await (await get(server, '/')).text()).not.toContain('order=random')
    expect(await (await get(server, '/api/admin/settings', { headers: { cookie } } as never)).status).toBeDefined()
    expect((await send('PUT', '/api/admin/settings', { ...SETTINGS, homeOrder: 'backwards' })).status).toBe(422)
    // Left out, as an older admin page would, it stays as it was.
    expect((await send('PUT', '/api/admin/settings', SETTINGS)).status).toBe(200)
    expect(await site()).toMatchObject({ homeOrder: 'sequence' })
  })

  it('offers on the front page the albums switched on for it, and no others', async () => {
    const travel = await album('Travel photos')
    const birthday = await album('Birthday photos')
    const quiet = await album('Not for the front', { onFront: false })
    const empty = await album('Nothing in it')
    const hidden = await album('Hidden album')
    await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(0, 3), action: 'add-to-album', album: travel })
    await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(3, 5), action: 'add-to-album', album: birthday })
    await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(5, 6), action: 'add-to-album', album: quiet })
    await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(6, 7), action: 'add-to-album', album: hidden })
    await send('PATCH', `/api/admin/albums/${hidden}`, { visibility: 'hidden' })
    void empty
    // A new album is on the front page unless it is made otherwise; newest first, like the albums page.
    expect((await site()).frontAlbums).toEqual([{ slug: 'birthday-photos', title: 'Birthday photos' }, { slug: 'travel-photos', title: 'Travel photos' }])
    const admin = (await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { title: string, onFront: boolean }[] }).albums
    expect(Object.fromEntries(admin.map(one => [one.title, one.onFront]))).toMatchObject({ 'Travel photos': true, 'Not for the front': false })

    const home = await (await get(server, '/')).text()
    expect(home).toMatch(/<nav class="fb-chooser"/)
    expect(home).toMatch(/<a[^>]+href="\/\?album=travel-photos"[^>]*>Travel photos<\/a>/)
    expect(home).not.toContain('Not for the front')
    expect(home).not.toContain('Hidden album')
    expect(home).toMatch(/<a[^>]+aria-current="page"[^>]*>All<\/a>|<a[^>]+aria-current="page"[^>]*href="\/"[^>]*>All<\/a>/)

    // Choosing one shows that album only, in the album's order, and marks it.
    const chosen = await (await get(server, '/?album=travel-photos')).text()
    expect(chosen).toMatch(/<a[^>]+href="\/\?album=travel-photos"[^>]+aria-current="page"|<a[^>]+aria-current="page"[^>]+href="\/\?album=travel-photos"/)
    for (const name of ['p01', 'p02', 'p03']) expect(chosen).toContain(`/photo/${name}"`)
    expect(chosen).not.toContain('/photo/p04"')
    // An album that is not offered, or does not exist, is not shown this way: the front page shows everything.
    for (const wrong of ['not-for-the-front', 'hidden-album', 'no-such-album']) {
      const page = await (await get(server, `/?album=${wrong}`)).text()
      expect(page, wrong).toContain('/photo/p40"')
    }
  })

  it('takes an album off the front page when it is switched off, and shows no chooser when none is left', async () => {
    const albums = (await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { id: string, title: string }[] }).albums
    for (const one of albums) expect((await send('PATCH', `/api/admin/albums/${one.id}`, { onFront: false })).status).toBe(200)
    expect((await site()).frontAlbums).toEqual([])
    expect(await (await get(server, '/')).text()).not.toContain('fb-chooser')
    expect((await send('PATCH', `/api/admin/albums/${albums[0]!.id}`, { onFront: 'yes' })).status).toBe(422)
  })

  it('leaves a site that was set up before this version in the order it had', async () => {
    const old = await startServer()
    try {
      await completeSetup(old)
      await old.stop()
      // As it was before: no choice recorded, the albums table without the new column's data, and this migration not yet run.
      const db = new Database(join(old.dataDir, 'fotobogen.db'))
      db.prepare(`delete from settings where key = 'layout.home_order'`).run()
      db.prepare(`delete from __migrations where name = '0008_front_page'`).run()
      db.exec(`alter table albums drop column on_front`)
      db.close()
      await old.restart()
      expect(await (await get(old, '/api/site')).json()).toMatchObject({ homeOrder: 'sequence' })
    }
    finally {
      await old.stop()
    }
  })
})
