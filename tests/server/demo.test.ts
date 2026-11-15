// Demo mode: anyone may log in as demo / demo and look round the admin,
// and nothing they do changes anything. The owner's login keeps full control.
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

const login = async (server: TestServer, username: string, password: string) => {
  const response = await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'origin': server.url, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
  return { status: response.status, cookie: response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ') }
}

describe('a demo site', () => {
  let server: TestServer
  let owner: string
  let demo: string
  let photoId: string
  const as = (cookie: string, method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const message = async (response: Response) => (await response.json() as { message: string }).message
  /** Everything stored, so "nothing changed" can be checked exactly. */
  const everything = () => JSON.stringify([
    query(server, `select key, value from settings where key not like 'webhooks.%' order by key`),
    query(server, 'select id, title, visibility, sort_order, recipe_json, status from photos order by id'),
    query(server, 'select * from albums order by id'), query(server, 'select name, enabled from modules order by name'),
    query(server, 'select count(*) as n from api_tokens'), query(server, 'select count(*) as n from jobs'),
  ])

  beforeAll(async () => {
    server = await startServer({ env: { DEMO_MODE: '1' } })
    owner = await completeSetup(server)
    const response = await upload(server, owner, await imageBuffer({ seed: 51, exif: undefined }), 'pier.jpg')
    photoId = (await response.json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, owner)
    // A place recorded in the file, as a camera or phone would.
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    try { db.prepare(`update photos set lat = 41.8781, lng = -87.6298, visibility = 'hidden' where id = ?`).run(photoId) }
    finally { db.close() }
  })
  afterAll(async () => { await server.stop() })

  it('tells the login page that demo / demo will work', async () => {
    expect(await (await get(server, '/api/auth/demo')).json()).toEqual({ enabled: true, username: 'demo', password: 'demo' })
    const page = await (await get(server, '/login', { accept: 'text/html' })).text()
    expect(page).toContain('This is a demonstration site')
    expect(page).toContain('Look round the admin')
  })

  it('lets anyone in with demo / demo, to read the admin', async () => {
    const entered = await login(server, 'demo', 'demo')
    expect(entered.status).toBe(200)
    demo = entered.cookie
    expect(await (await get(server, '/api/auth/me', { cookie: demo })).json()).toEqual({ user: { username: 'demo' }, demo: true, acknowledged: true })
    for (const path of ['overview', 'system', 'settings', 'site-text', 'seo', 'brand', 'skins', 'modules', 'albums', 'samples', 'photos', `photos/${photoId}`]) {
      expect((await get(server, `/api/admin/${path}`, { cookie: demo })).status, path).toBe(200)
    }
    // The pages themselves open, with the notice that it is a demo.
    const page = await get(server, '/admin', { cookie: demo, accept: 'text/html' })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Nothing can be changed, and nothing you try is saved.')
  })

  it('refuses everything that would change the site, and leaves it exactly as it was', async () => {
    const before = everything()
    const form = new FormData()
    form.append('file', new Blob([await imageBuffer({ seed: 52 }) as BlobPart]), 'intruder.jpg')
    const uploaded = await fetch(`${server.url}/api/admin/photos`, { method: 'POST', headers: { origin: server.url, cookie: demo }, body: form })
    expect([uploaded.status, await message(uploaded)]).toEqual([403, 'This is a demo: you can look at everything, but nothing can be changed.'])

    const attempts: [string, string, unknown][] = [
      ['PATCH', `/api/admin/photos/${photoId}`, { title: 'Defaced', visibility: 'public' }], ['DELETE', `/api/admin/photos/${photoId}`, undefined],
      ['POST', '/api/admin/photos/bulk', { ids: [photoId], action: 'delete' }], ['PUT', `/api/admin/photos/${photoId}/recipe`, { recipe: [] }],
      ['PUT', '/api/admin/settings', { siteTitle: 'Defaced', tagline: '', grid: 'square', photoView: 'page', showExif: true, showLocation: true }],
      ['PUT', '/api/admin/site-text', { siteTitle: 'Defaced', tagline: '', language: 'en', text: { footerNote: 'Defaced' } }],
      ['PUT', '/api/admin/seo', { indexing: false }], ['PUT', '/api/admin/skins', { active: 'papier', options: {} }],
      ['PUT', '/api/admin/modules/filmlooks', { enabled: true }], ['PUT', '/api/admin/site-recipe', { recipe: [] }],
      ['POST', '/api/admin/albums', { title: 'Defaced' }], ['POST', '/api/admin/samples', undefined], ['DELETE', '/api/admin/samples', undefined],
      ['POST', '/api/admin/tokens', { name: 'Mine now', scope: 'manage' }], ['POST', '/api/admin/webhooks', { url: 'https://example.com/hook', events: ['photo.published'] }],
      ['DELETE', '/api/admin/brand/icon', undefined], ['PUT', '/api/admin/brand', { logoHeight: 120 }], ['POST', '/api/admin/updates', undefined], ['POST', '/api/admin/acknowledge', undefined],
    ]
    for (const [method, path, body] of attempts) {
      const response = await as(demo, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(403)
    }
    expect(everything()).toBe(before)
    expect((await (await get(server, '/api/site')).json() as { title: string }).title).toBe('Test Photos')
  })

  it('keeps the backup, tokens, webhooks, and where photos were taken out of a demo visitor\'s sight', async () => {
    for (const path of ['backup', 'tokens', 'webhooks']) {
      const response = await get(server, `/api/admin/${path}`, { cookie: demo })
      expect([response.status, await message(response)], path).toEqual([403, 'This part of the admin is not shown in the demo.'])
    }
    const seen = await (await get(server, `/api/admin/photos/${photoId}`, { cookie: demo })).json() as { details: { location: unknown } }
    expect(seen.details.location).toBeNull()
    // The owner still sees it.
    const owned = await (await get(server, `/api/admin/photos/${photoId}`, { cookie: owner })).json() as { details: { location: unknown } }
    expect(owned.details.location).toEqual({ lat: 41.8781, lng: -87.6298 })
  })

  it('lets a demo visitor try a look, which draws a preview and saves nothing', async () => {
    await as(owner, 'PUT', '/api/admin/modules/filmlooks', { enabled: true })
    const before = everything()
    const preview = await as(demo, 'POST', `/api/admin/photos/${photoId}/preview`, { recipe: [{ module: 'filmlooks', transform: 'film-look', params: {} }] })
    expect([preview.status, preview.headers.get('content-type')]).toEqual([200, 'image/webp'])
    expect(everything()).toBe(before)
  })

  it('leaves the owner in full control with their own login', async () => {
    const real = await login(server, ADMIN.username, ADMIN.password)
    expect(real.status).toBe(200)
    expect((await (await get(server, '/api/auth/me', { cookie: real.cookie })).json() as { demo: boolean }).demo).toBe(false)
    expect((await as(real.cookie, 'PATCH', `/api/admin/photos/${photoId}`, { title: 'Named by the owner' })).status).toBe(200)
    expect((await get(server, '/api/admin/backup', { cookie: real.cookie })).status).toBe(200)
    expect((await get(server, '/api/admin/tokens', { cookie: real.cookie })).status).toBe(200)
    // Wrong guesses at the owner's password are still counted and still refused.
    expect((await login(server, ADMIN.username, 'demo')).status).toBe(401)
    expect((await login(server, 'demo', 'wrong')).status).toBe(401)
  })

  it('can log out', async () => {
    const entered = await login(server, 'demo', 'demo')
    expect((await as(entered.cookie, 'POST', '/api/auth/logout')).status).toBe(200)
  })
})

describe('a site that is not a demo', () => {
  it('has no demo login, and a demo session from before is worth nothing', async () => {
    const demoSite = await startServer({ env: { DEMO_MODE: '1' } })
    const dataDir = demoSite.dataDir
    await completeSetup(demoSite)
    const visitor = await login(demoSite, 'demo', 'demo')
    expect(visitor.status).toBe(200)
    await demoSite.stop()

    // The same site started again without the flag.
    const server = await startServer({ dataDir })
    try {
      expect(await (await get(server, '/api/auth/demo')).json()).toEqual({ enabled: false })
      expect((await login(server, 'demo', 'demo')).status).toBe(401)
      expect((await get(server, '/api/admin/overview', { cookie: visitor.cookie })).status).toBe(401)
      expect(await (await get(server, '/login', { accept: 'text/html' })).text()).not.toContain('demonstration')
    }
    finally { await server.stop() }
  })
})
