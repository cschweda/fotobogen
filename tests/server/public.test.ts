import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Tile { slug: string, alt: string, span: number, placeholder: string | null, thumb: { url: string, width: number } }
interface Photo { slug: string, title: string | null, exif: { camera: string | null } | null, location: unknown, images: { url: string, width: number }[], previous: string | null, next: string | null }

describe('the public site', () => {
  let server: TestServer
  let cookie: string
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const tiles = async (page = 1) => await (await get(server, `/api/photos?page=${page}`)).json() as { page: number, pages: number, total: number, tiles: Tile[] }
  const sql = (statement: string) => {
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.exec(statement)
    db.close()
  }

  beforeAll(async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'fotobogen-test-')), 'data')
    // A skin the owner installed: a folder in data/skins.
    mkdirSync(join(dataDir, 'skins', 'paper'), { recursive: true })
    writeFileSync(join(dataDir, 'skins', 'paper', 'skin.json'), JSON.stringify({
      name: 'paper', version: '0.1.0', label: 'Paper', tokens: { ground: '#ffffff', text: '#999999' }, contrast: [['text', 'ground']],
      options: { ink: { type: 'color', default: '#111111' } },
    }))
    writeFileSync(join(dataDir, 'skins', 'paper', 'skin.css'), ':root.fb-public { background: white; }')
    server = await startServer({ dataDir })
    cookie = await completeSetup(server)
    for (const [seed, name, width, height] of [[1, 'harbour.jpg', 900, 600], [2, 'tower.jpg', 600, 900], [3, 'field.jpg', 1200, 400]] as const) {
      await upload(server, cookie, await imageBuffer({ seed, width, height, exif: { Make: 'Leica', Model: 'M11' } }), name)
    }
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('lists public photos newest first, with what the grid needs and no login', async () => {
    const page = await tiles()
    expect(page).toMatchObject({ page: 1, pages: 1, total: 3 })
    expect(page.tiles.map(tile => tile.slug)).toEqual(['field', 'tower', 'harbour'])
    // Rows spanned in the masonry grid follow each photo's shape: wide, tall, ordinary.
    expect(page.tiles.map(tile => tile.span)).toEqual([7, 30, 13])
    expect(page.tiles[0]!.placeholder).toMatch(/^data:image\/png;base64,/)
    expect(page.tiles[0]!.thumb).toMatchObject({ width: 480 })
    expect((await get(server, page.tiles[0]!.thumb.url)).status).toBe(200)
  })

  it('never shows hidden, failed, or still-processing photos, anywhere', async () => {
    sql(`update photos set visibility = 'hidden' where slug = 'tower'`)
    expect((await tiles()).tiles.map(tile => tile.slug)).toEqual(['field', 'harbour'])
    expect((await get(server, '/api/photos/tower')).status).toBe(404)
    expect((await get(server, '/photo/tower')).status).toBe(404)
    for (const path of ['/feed.xml', '/sitemap.xml', '/']) {
      expect(await (await get(server, path)).text(), path).not.toContain('tower')
    }
    // Its neighbours skip over it.
    const field = await (await get(server, '/api/photos/field')).json() as Photo
    expect(field).toMatchObject({ previous: null, next: 'harbour' })
    sql(`update photos set visibility = 'public', status = 'processing' where slug = 'tower'`)
    expect((await tiles()).total).toBe(2)
    sql(`update photos set status = 'ready' where slug = 'tower'`)
    expect((await tiles()).total).toBe(3)
  })

  it('gives a photo its larger copies and its neighbours, and camera details only when the site shows them', async () => {
    const tower = await (await get(server, '/api/photos/tower')).json() as Photo
    expect(tower).toMatchObject({ slug: 'tower', previous: 'field', next: 'harbour', exif: { camera: 'Leica M11' }, location: null })
    expect(tower.images.map(image => image.width)).toEqual([600])
    sql(`update settings set value = 'false' where key = 'privacy.show_exif'`)
    expect((await (await get(server, '/api/photos/tower')).json() as Photo).exif).toBeNull()
    expect(await (await get(server, '/photo/tower')).text()).not.toContain('Leica')
    sql(`update settings set value = 'true' where key = 'privacy.show_exif'`)
  })

  it('never reveals where a photo was taken unless the site is set to', async () => {
    sql(`update photos set lat = 47.37, lng = 8.54 where slug = 'tower'`)
    expect(await (await get(server, '/api/photos/tower')).text()).not.toContain('47.37')
    sql(`update settings set value = 'true' where key = 'privacy.show_location'`)
    expect((await (await get(server, '/api/photos/tower')).json() as Photo).location).toEqual({ lat: 47.37, lng: 8.54 })
    sql(`update settings set value = 'false' where key = 'privacy.show_location'`)
  })

  it('renders the grid and the photo page on the server, so they work without JavaScript', async () => {
    const home = await (await get(server, '/')).text()
    expect(home).toContain('class="dark fb-public"')
    expect(home).toContain('fb-grid--masonry')
    expect(home).toMatch(/<a class="fb-tile__link" href="\/photo\/field"/)
    expect(home).toMatch(/--fb-span:\s?7/)
    expect(home).not.toContain('name="robots"')

    const photo = await (await get(server, '/photo/harbour')).text()
    expect(photo).toContain('<title>harbour | Test Photos</title>'.replace('harbour |', 'Untitled |'))
    expect(photo).toMatch(/property="og:image" content="http:\/\/localhost:\d+\/media\/[\w-]+-medium-[0-9a-f]{8}\.webp"/)
    expect(photo).toContain('name="twitter:card" content="summary_large_image"')
    expect(photo).toMatch(/rel="prev"|rel="next"/)
    // Private pages stay out of search engines; public ones do not.
    expect(await (await get(server, '/login')).text()).toContain('name="robots" content="noindex"')
  })

  it('pages the grid with real links', async () => {
    const values = Array.from({ length: 31 }, (_, index) => `('zz-extra-${index}', 'extra-${index}', 'zz-extra-${index}.jpg', 'zz-extra-${index}.jpg', 'image/jpeg', 1, 'sum${index}', 300, 200, 'ready', 'public', 0, ${100 + index}, 1, 1)`).join(', ')
    sql(`insert into photos (id, slug, original_path, original_filename, mime, bytes, checksum, width, height, status, visibility, is_sample, sort_order, created_at, updated_at) values ${values}`)
    sql(`insert into derivatives (id, photo_id, kind, format, width, height, path, bytes) select 't' || id, id, 'thumb', 'webp', 300, 200, id || '-thumb-00000000.webp', 1 from photos where id like 'zz-extra-%'`)
    sql(`insert into derivatives (id, photo_id, kind, format, width, height, path, bytes) select 's' || id, id, 'square', 'webp', 200, 200, id || '-square-00000000.webp', 1 from photos where id like 'zz-extra-%'`)
    const first = await tiles(1)
    expect(first).toMatchObject({ pages: 2, total: 34 })
    expect(first.tiles).toHaveLength(30)
    expect((await tiles(2)).tiles).toHaveLength(4)
    expect((await tiles(99)).tiles).toEqual([])
    expect(await (await get(server, '/')).text()).toContain('href="/?page=2"')
    expect(await (await get(server, '/?page=2')).text()).toContain('Previous page')
    sql(`delete from photos where id like 'zz-extra-%'`)
  })

  it('publishes a feed, a sitemap, and robots.txt with full addresses', async () => {
    const feed = await get(server, '/feed.xml')
    expect(feed.headers.get('content-type')).toContain('application/rss+xml')
    const xml = await feed.text()
    expect(xml).toContain('<title>Test Photos</title>')
    expect(xml).toContain(`<link>${server.url}/photo/field</link>`)
    expect(xml.match(/<item>/g)).toHaveLength(3)
    const sitemap = await (await get(server, '/sitemap.xml')).text()
    expect(sitemap).toContain(`<loc>${server.url}/</loc>`)
    expect(sitemap).toContain(`<loc>${server.url}/photo/tower</loc>`)
    const robots = await (await get(server, '/robots.txt')).text()
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain(`Sitemap: ${server.url}/sitemap.xml`)
  })

  it('escapes titles and descriptions in the feed', async () => {
    sql(`update photos set title = 'Rock & <Roll>', description = 'A "quoted" caption' where slug = 'field'`)
    const xml = await (await get(server, '/feed.xml')).text()
    expect(xml).toContain('<title>Rock &amp; &lt;Roll&gt;</title>')
    expect(xml).not.toContain('<Roll>')
  })

  describe('skins', () => {
    const skins = async () => await (await get(server, '/api/admin/skins', { cookie })).json() as { active: string, skins: { name: string, source: string, error: string | null, warnings: string[] }[] }
    const css = async () => await (await get(server, '/skin.css')).text()

    it('serves the Swiss skin by default, cacheable for good when its version is in the address', async () => {
      const { skinVersion } = await (await get(server, '/api/site')).json() as { skinVersion: string }
      const versioned = await get(server, `/skin.css?v=${skinVersion}`)
      expect(versioned.headers.get('content-type')).toContain('text/css')
      expect(versioned.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
      expect((await get(server, '/skin.css')).headers.get('cache-control')).toBe('no-cache')
      expect(await css()).toContain('--fb-accent: #e30613;')
      expect(await (await get(server, '/')).text()).toContain(`/skin.css?v=${skinVersion}`)
    })

    it('lists installed skins and warns about text that would be hard to read', async () => {
      const listed = await skins()
      expect(listed.active).toBe('swiss')
      expect(listed.skins.map(skin => [skin.name, skin.source, skin.error])).toEqual([['swiss', 'bundled', null], ['paper', 'installed', null]])
      expect(listed.skins[1]!.warnings[0]).toContain('"text" on "ground" has a contrast of 2.8:1')
    })

    it('changes options and switches skin with no rebuild, giving the stylesheet a new address', async () => {
      const before = (await (await get(server, '/api/site')).json() as { skinVersion: string }).skinVersion
      expect((await send('PUT', '/api/admin/skins', { active: 'swiss', options: { accent: '#00aaff', columns: 99, gutter: 'wide' } })).status).toBe(200)
      expect(await css()).toContain('--fb-accent: #00aaff;')
      expect(await css()).toContain('--fb-columns: 6;')
      expect((await (await get(server, '/api/site')).json() as { skinVersion: string }).skinVersion).not.toBe(before)

      expect((await send('PUT', '/api/admin/skins', { active: 'paper', options: {} })).status).toBe(200)
      expect(await css()).toContain('background: white')
      // Each skin remembers its own options.
      expect((await send('PUT', '/api/admin/skins', { active: 'swiss', options: (await skins() as never as { skins: { values: unknown }[] }).skins[0]!.values })).status).toBe(200)
      expect(await css()).toContain('--fb-accent: #00aaff;')
    })

    it('refuses an unknown skin, and needs a logged-in admin', async () => {
      expect((await send('PUT', '/api/admin/skins', { active: 'no-such-skin' })).status).toBe(404)
      expect((await get(server, '/api/admin/skins')).status).toBe(401)
      const anonymous = await fetch(server.url + '/api/admin/skins', { method: 'PUT', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{"active":"paper"}' })
      expect(anonymous.status).toBe(401)
    })
  })
})
