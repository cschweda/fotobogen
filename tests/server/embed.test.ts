import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

describe('the slideshow for other sites', () => {
  let server: TestServer
  let cookie: string
  const send = (method: string, path: string, body: unknown, headers: Record<string, string> = { origin: '', cookie: '' }) => fetch(server.url + path, {
    method, headers: { 'content-type': 'application/json', ...headers, ...(headers.origin === '' ? { origin: server.url, cookie } : {}) }, body: JSON.stringify(body),
  })
  const page = async (path: string) => {
    const response = await get(server, path)
    return { status: response.status, html: await response.text(), policy: response.headers.get('content-security-policy') ?? '', frameOptions: response.headers.get('x-frame-options') }
  }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    const ids: string[] = []
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      const response = await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 900, height: 600 }), `${name}.jpg`)
      ids.push((await response.json() as { photo: { id: string } }).photo.id)
    }
    await whenProcessed(server, cookie)
    const album = (await (await send('POST', '/api/admin/albums', { title: 'Coast' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(0, 2), action: 'add-to-album', album })
    await send('PATCH', `/api/admin/photos/${ids[2]}`, { tags: ['night'] })
  })
  afterAll(() => server.stop())

  it('is off to begin with: there is no such page', async () => {
    expect(await (await get(server, '/api/admin/embed', { cookie })).json()).toMatchObject({ enabled: false })
    expect((await page('/embed/slideshow?album=coast')).status).toBe(404)
    // The answer that says so is not something another site can put in a frame, either.
    const { status, html, policy, frameOptions } = await page('/embed/slideshow')
    expect(status).toBe(404)
    expect(html).toBe('This slideshow is not available.')
    expect(policy).toContain('frame-ancestors \'none\'')
    expect(policy).not.toContain('*')
    expect(frameOptions).toBe('DENY')
  })

  it('is switched on by the logged-in owner, never with an API token', async () => {
    const { token } = await (await send('POST', '/api/admin/tokens', { name: 'script', scope: 'manage' })).json() as { token: string }
    expect((await send('PUT', '/api/admin/embed', { enabled: true }, { authorization: `Bearer ${token}` })).status).toBe(403)
    expect((await send('PUT', '/api/admin/embed', { enabled: true }, { origin: server.url })).status).toBe(401)
    expect((await send('PUT', '/api/admin/embed', { enabled: 'yes' })).status).toBe(422)
    expect((await page('/embed/slideshow')).status).toBe(404)

    const saved = await send('PUT', '/api/admin/embed', { enabled: true })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ enabled: true })
  })

  it('tells the admin what can be embedded: every photo, a public album, or a tag', async () => {
    const answer = await (await get(server, '/api/admin/embed', { cookie })).json() as { enabled: boolean, albums: unknown[], tags: unknown[], siteTitle: string }
    expect(answer).toMatchObject({ enabled: true, siteTitle: 'Test Photos', albums: [{ slug: 'coast', title: 'Coast' }], tags: [{ slug: 'night', name: 'night' }] })
  })

  it('may then be shown inside a page of any other site, with its credit', async () => {
    const { status, html, policy, frameOptions } = await page('/embed/slideshow')
    expect(status).toBe(200)
    expect(policy).toMatch(/frame-ancestors \*(;|$)/)
    expect(frameOptions).toBeNull()
    // The credit, with the name as Fotobogen's own mark: the red frame, then the word.
    const credit = /<a[^>]+href="https:\/\/fotobogen\.com\/"[^>]*>(.*?)<\/a>/.exec(html)?.[1] ?? ''
    expect(credit.replace(/<[^>]+>/g, '')).toBe('Powered by Fotobogen')
    expect(credit).toMatch(/class="embed__frame"[^>]*aria-hidden="true"/)
    expect(html).toContain('1 / 3')
    // Search engines are sent to the site itself, not to the page made for frames.
    expect(html).toMatch(/<meta name="robots" content="noindex"/)
  })

  it('plays one album or one tag, and is not found for one that does not exist', async () => {
    expect((await page('/embed/slideshow?album=coast')).html).toContain('1 / 2')
    expect((await page('/embed/slideshow?tag=night')).html).toContain('1 / 1')
    expect((await page('/embed/slideshow?album=no-such-album')).status).toBe(404)
    // Nothing else lives under /embed, and what says so cannot be framed.
    for (const path of ['/embed', '/embed/nothing-here', '/EMBED/Slideshow/more']) {
      const { status, policy, frameOptions } = await page(path)
      expect(status, path).toBe(404)
      expect(policy, path).toContain('frame-ancestors \'none\'')
      expect(frameOptions, path).toBe('DENY')
    }
  })

  it('opens nothing else to other sites: every other page still refuses to be framed by them', async () => {
    for (const path of ['/', '/slideshow', '/albums']) {
      const { policy, frameOptions } = await page(path)
      expect(policy, path).toContain('frame-ancestors \'self\'')
      expect(frameOptions, path).toBe('SAMEORIGIN')
    }
    expect((await page('/login')).policy).toContain('frame-ancestors \'none\'')
  })

  it('never carries a counting script, whatever the site\'s own pages load', async () => {
    expect((await send('PUT', '/api/admin/stats', { provider: 'plausible', plausibleScript: 'https://plausible.io/js/pa-AbC123.js' })).status).toBe(200)
    expect((await page('/')).html).toContain('plausible')
    const { html, policy } = await page('/embed/slideshow')
    expect(html).not.toContain('plausible')
    expect(policy).not.toContain('plausible')
  })

  it('goes away again when switched off', async () => {
    expect((await send('PUT', '/api/admin/embed', { enabled: false })).status).toBe(200)
    expect((await page('/embed/slideshow')).status).toBe(404)
  })
})
