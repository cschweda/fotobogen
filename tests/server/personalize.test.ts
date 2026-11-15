// The owner can put the whole public site in their own words, and decide
// what search engines and social networks are told about it.
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('a site in its owner\'s own words', () => {
  let server: TestServer
  let cookie: string
  let photoId: string
  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  // Asked for the way a browser asks, so an address that leads nowhere answers with a page.
  const page = async (path: string) => await (await get(server, path, { accept: 'text/html,*/*' })).text()
  const canonical = (html: string) => html.match(/<link [^>]*rel="canonical" href="([^"]*)"/)?.[1]
  const meta = (html: string, name: string) => html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1]
  const title = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1]
  const seo = (settings: Record<string, unknown>) => send('PUT', '/api/admin/seo', settings)

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server, { photoView: 'page' })
    for (const [seed, name] of [[21, 'harbour.jpg'], [22, 'tower.jpg']] as const) {
      const response = await upload(server, cookie, await imageBuffer({ width: 900, height: 600, seed }), name)
      photoId = (await response.json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
    await send('PATCH', `/api/admin/photos/${photoId}`, { title: 'The Tower', description: 'A water tower at dusk.', alt: 'A water tower against an orange sky' })
  })
  afterAll(async () => { await server.stop() })

  describe('the words', () => {
    it('never shows the software\'s name on a public page, a feed, or an error page', async () => {
      for (const path of ['/', '/photo/tower', '/albums', '/slideshow', '/no-such-page', '/photo/no-such-photo', '/feed.xml', '/sitemap.xml', '/robots.txt']) {
        // The page as a visitor reads it: tags and scripts removed.
        const words = (await page(path)).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
        expect(words.includes('Fotobogen'), `${path} says "Fotobogen"`).toBe(false)
      }
      expect(title(await page('/no-such-page'))).toBe('Page not found | Test Photos')
    })

    it('replaces any piece of text, on every page that shows it', async () => {
      const saved = await send('PUT', '/api/admin/site-text', {
        siteTitle: 'Ana Lima', tagline: 'Fotografias do Porto', language: 'pt',
        text: { navPhotos: 'Fotografias', navSlideshow: 'Apresentação', modeDark: 'Modo escuro', backToPhotos: 'Todas as fotografias', next: 'Seguinte', footerNote: '© 2026 Ana Lima', notFoundTitle: 'Página não encontrada', feedLink: 'RSS feed', notAKey: 'x' },
      })
      expect(saved.status).toBe(200)
      // Wording equal to the default, and keys that do not exist, are not stored.
      expect(Object.keys((await saved.json() as { text: object }).text).sort()).toEqual(['backToPhotos', 'footerNote', 'modeDark', 'navPhotos', 'navSlideshow', 'next', 'notFoundTitle'])

      const home = await page('/')
      expect(home).toMatch(/<html\s+lang="pt"/)
      expect(home).toContain('>Ana Lima</a>')
      expect(home).toContain('>Fotografias</a>')
      expect(home).toContain('>Apresentação</a>')
      expect(home).toContain('Modo escuro')
      expect(home).toContain('© 2026 Ana Lima')
      expect(home).not.toContain('>Photos</a>')
      // Text that was not changed keeps its default.
      expect(home).toContain('Light mode')

      const photo = await page('/photo/tower')
      expect(photo).toContain('>Todas as fotografias</a>')
      // The newest photo has only a photo after it.
      expect(photo).toContain('>Seguinte</a>')
      expect(title(await page('/no-such-page'))).toBe('Página não encontrada | Ana Lima')
      expect(await page('/feed.xml')).toContain('<title>Ana Lima</title>')
    })

    it('shows text as text: markup typed into a field is not run', async () => {
      await send('PUT', '/api/admin/site-text', { siteTitle: 'Ana Lima', tagline: '', language: 'en', text: { footerNote: '<img src=x onerror=alert(1)>', navPhotos: '"><script>alert(1)</script>' } })
      const home = await page('/')
      expect(home).not.toContain('<img src=x')
      expect(home).not.toContain('<script>alert(1)')
      expect(home).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('goes back to the defaults when the fields are emptied', async () => {
      expect((await send('PUT', '/api/admin/site-text', { siteTitle: 'Ana Lima', tagline: 'Photographs from Porto', language: 'en', text: {} })).status).toBe(200)
      const home = await page('/')
      expect(home).toContain('>Photos</a>')
      expect(home).toMatch(/<html\s+lang="en"/)
      expect((await (await get(server, '/api/admin/site-text', { cookie })).json() as { text: object }).text).toEqual({})
    })

    it('refuses a language that is not a code, an empty title, and anyone not logged in', async () => {
      const bad = await send('PUT', '/api/admin/site-text', { siteTitle: 'Ana Lima', tagline: '', language: 'Portuguese', text: {} })
      expect(bad.status).toBe(422)
      expect((await bad.json() as { errors: Record<string, string> }).errors.language).toMatch(/language code/)
      expect((await send('PUT', '/api/admin/site-text', { siteTitle: '', tagline: '', language: 'en', text: {} })).status).toBe(422)
      expect((await get(server, '/api/admin/site-text')).status).toBe(401)
      expect((await fetch(server.url + '/api/admin/site-text', { method: 'PUT', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    })
  })

  describe('search and sharing', () => {
    it('by default uses the site\'s title and tagline, and the newest photo as the picture', async () => {
      const home = await page('/')
      expect(title(home)).toBe('Ana Lima')
      expect(meta(home, 'description')).toBe('Photographs from Porto')
      expect(meta(home, 'og:site_name')).toBe('Ana Lima')
      expect(meta(home, 'og:image')).toMatch(new RegExp(`^${server.url}/media/.+\\.webp$`))
      expect(meta(home, 'og:image:alt')).toBe('A water tower against an orange sky')
      expect(meta(home, 'twitter:card')).toBe('summary_large_image')
      expect(meta(home, 'robots')).toBeUndefined()
      expect(canonical(home)).toBe(`${server.url}/`)
      expect(title(await page('/photo/tower'))).toBe('The Tower | Ana Lima')
    })

    it('applies the owner\'s title, description, title style, and details to every page', async () => {
      const saved = await seo({ homeTitle: 'Ana Lima, photographer in Porto', description: 'Street photographs of Porto, on film.', titlePattern: '{site}: {page}', author: 'Ana Lima', twitter: '@ana_lima', googleVerification: 'g-code_1', bingVerification: 'B1NG' })
      expect(saved.status).toBe(200)
      const home = await page('/')
      expect(title(home)).toBe('Ana Lima, photographer in Porto')
      expect(meta(home, 'description')).toBe('Street photographs of Porto, on film.')
      expect(meta(home, 'og:title')).toBe('Ana Lima, photographer in Porto')
      expect(meta(home, 'author')).toBe('Ana Lima')
      expect(meta(home, 'twitter:creator')).toBe('@ana_lima')
      expect(meta(home, 'google-site-verification')).toBe('g-code_1')
      expect(meta(home, 'msvalidate.01')).toBe('B1NG')

      // A photo keeps its own words and picture; only the way the title is written changes.
      const photo = await page('/photo/tower')
      expect(title(photo)).toBe('Ana Lima: The Tower')
      expect(meta(photo, 'description')).toBe('A water tower at dusk.')
      expect(meta(photo, 'og:type')).toBe('article')
      expect(title(await page('/albums'))).toBe('Ana Lima: Albums')
      expect(await page('/feed.xml')).toContain('<description>Street photographs of Porto, on film.</description>')
    })

    it('uses the chosen photo as the sharing picture, or none', async () => {
      await seo({ cardPhoto: 'harbour' })
      const chosen = meta(await page('/'), 'og:image')!
      await seo({ cardPhoto: '' })
      expect(meta(await page('/'), 'og:image')).not.toBe(chosen)
      // A photo's own page always shows that photo.
      await seo({ cardPhoto: 'harbour' })
      expect(meta(await page('/photo/tower'), 'og:image')).not.toBe(chosen)
      expect(meta(await page('/albums'), 'og:image')).toBe(chosen)

      await seo({ cardPhoto: 'none' })
      const bare = await page('/')
      expect(meta(bare, 'og:image')).toBeUndefined()
      expect(meta(bare, 'twitter:card')).toBe('summary')
      // A photo that is no longer public is not used: the newest public one is.
      await seo({ cardPhoto: 'no-such-photo' })
      expect(meta(await page('/'), 'og:image')).toMatch(/\/media\//)
    })

    it('asks search engines to stay away when the owner says so', async () => {
      await seo({ indexing: false })
      for (const path of ['/', '/photo/tower', '/albums']) expect(meta(await page(path), 'robots'), path).toBe('noindex, nofollow')
      expect(await page('/robots.txt')).toBe('User-agent: *\nDisallow: /\n')
      await seo({ indexing: true })
      expect(meta(await page('/'), 'robots')).toBeUndefined()
      expect(await page('/robots.txt')).toContain('Sitemap:')
    })

    it('gives search engines the site\'s proper address when one is set', async () => {
      await seo({ siteUrl: 'https://photos.example.com/ignored/path' })
      const photo = await page('/photo/tower')
      expect(canonical(photo)).toBe('https://photos.example.com/photo/tower')
      expect(meta(photo, 'og:url')).toBe('https://photos.example.com/photo/tower')
      expect(meta(photo, 'og:image')).toMatch(/^https:\/\/photos\.example\.com\/media\//)
      expect(await page('/sitemap.xml')).toContain('<loc>https://photos.example.com/photo/tower</loc>')
      expect(await page('/robots.txt')).toContain('Sitemap: https://photos.example.com/sitemap.xml')
      expect(await page('/feed.xml')).toContain('<link>https://photos.example.com/</link>')
      await seo({})
      expect(canonical(await page('/photo/tower'))).toBe(`${server.url}/photo/tower`)
    })

    it('says what is wrong with a bad value and changes nothing, and needs a logged-in admin', async () => {
      await seo({ description: 'Kept.' })
      const bad = await seo({ description: 'Lost.', siteUrl: 'not an address', twitter: 'two words' })
      expect(bad.status).toBe(422)
      expect(Object.keys((await bad.json() as { errors: object }).errors).sort()).toEqual(['siteUrl', 'twitter'])
      expect(meta(await page('/'), 'description')).toBe('Kept.')
      expect((await get(server, '/api/admin/seo')).status).toBe(401)
      const listed = await (await get(server, '/api/admin/seo', { cookie })).json() as { photos: { slug: string }[], patterns: string[], preview: { siteTitle: string } }
      expect(listed.photos.map(photo => photo.slug).sort()).toEqual(['harbour', 'tower'])
      expect(listed.patterns).toHaveLength(5)
      expect(listed.preview.siteTitle).toBe('Ana Lima')
    })
  })

  describe('a photo\'s links', () => {
    it('gives the full address of its page and of each size of the picture', async () => {
      const detail = await (await get(server, `/api/admin/photos/${photoId}`, { cookie })).json() as { links: { page: string, images: { kind: string, url: string, width: number }[] } }
      expect(detail.links.page).toBe(`${server.url}/photo/tower`)
      expect(detail.links.images.map(image => image.kind).sort()).toEqual(['medium', 'square', 'thumb'])
      for (const image of detail.links.images) {
        expect(image.url.startsWith(`${server.url}/media/`), image.url).toBe(true)
        expect((await fetch(image.url)).status).toBe(200)
      }
      // With a proper address set, the links use it.
      await seo({ siteUrl: 'https://photos.example.com' })
      const fixed = await (await get(server, `/api/admin/photos/${photoId}`, { cookie })).json() as { links: { page: string } }
      expect(fixed.links.page).toBe('https://photos.example.com/photo/tower')
      await seo({})
    })
  })
})

describe('a site whose address is set on the server', () => {
  it('uses SITE_URL for every full address, whatever the admin field says', async () => {
    const server = await startServer({ env: { SITE_URL: 'https://photos.example.com/' } })
    try {
      const cookie = await completeSetup(server, { photoView: 'page' })
      const response = await upload(server, cookie, await imageBuffer({ width: 600, height: 400, seed: 31 }), 'pier.jpg')
      const id = (await response.json() as { photo: { id: string } }).photo.id
      await whenProcessed(server, cookie)

      const detail = await (await get(server, `/api/admin/photos/${id}`, { cookie })).json() as { links: { origin: string, page: string, images: { url: string }[] } }
      expect(detail.links.page).toBe('https://photos.example.com/photo/pier')
      expect(detail.links.images.every(image => image.url.startsWith('https://photos.example.com/media/'))).toBe(true)
      expect(await (await get(server, '/sitemap.xml')).text()).toContain('<loc>https://photos.example.com/photo/pier</loc>')
      expect(await (await get(server, '/')).text()).toMatch(/rel="canonical" href="https:\/\/photos\.example\.com\/"/)

      // The admin is told, and its own field does not override the server's.
      await fetch(server.url + '/api/admin/seo', { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ siteUrl: 'https://other.example.org' }) })
      expect((await (await get(server, '/api/admin/seo', { cookie })).json() as { serverSiteUrl: string }).serverSiteUrl).toBe('https://photos.example.com')
      expect(await (await get(server, '/robots.txt')).text()).toContain('Sitemap: https://photos.example.com/sitemap.xml')
    }
    finally { await server.stop() }
  })

  it('ignores a SITE_URL that is not a web address', async () => {
    const server = await startServer({ env: { SITE_URL: 'photos.example.com' } })
    try {
      await completeSetup(server)
      expect(await (await get(server, '/robots.txt')).text()).toContain(`Sitemap: ${server.url}/sitemap.xml`)
    }
    finally { await server.stop() }
  })
})

describe('picture quality', () => {
  it('makes every photo\'s copies again, smaller or larger, when the owner changes it, and leaves them alone otherwise', async () => {
    const server = await startServer()
    try {
      const cookie = await completeSetup(server)
      // A detailed picture, so that quality makes a clear difference to its size.
      await upload(server, cookie, await sharp({ create: { width: 1600, height: 1200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).jpeg({ quality: 95 }).toBuffer(), 'detail.jpg')
      await whenProcessed(server, cookie)
      const settings = async () => await (await get(server, '/api/admin/settings', { cookie })).json() as Record<string, unknown>
      const save = async (changes: Record<string, unknown>) => {
        const response = await fetch(server.url + '/api/admin/settings', { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...await settings(), ...changes }) })
        return { status: response.status, body: await response.json() as { queued?: number, errors?: Record<string, string> } }
      }
      const large = () => query<{ path: string, bytes: number }>(server, `select path, bytes from derivatives where kind = 'medium'`)[0]!

      expect((await settings()).photoQuality).toBe('standard')
      const standard = large()
      // Saving without changing the quality renders nothing.
      expect((await save({ tagline: 'Same quality' })).body.queued).toBe(0)

      expect((await save({ photoQuality: 'smaller' })).body.queued).toBe(1)
      await whenProcessed(server, cookie)
      const smaller = large()
      expect(smaller.bytes).toBeLessThan(standard.bytes * 0.9)
      // A new version of the picture has a new address, so browsers do not keep the old one.
      expect(smaller.path).not.toBe(standard.path)

      expect((await save({ photoQuality: 'high' })).body.queued).toBe(1)
      await whenProcessed(server, cookie)
      expect(large().bytes).toBeGreaterThan(standard.bytes * 1.1)
      expect((await settings()).photoQuality).toBe('high')

      const bad = await save({ photoQuality: 'lossless' })
      expect(bad.status).toBe(422)
      expect((await settings()).photoQuality).toBe('high')
    }
    finally { await server.stop() }
  })
})
