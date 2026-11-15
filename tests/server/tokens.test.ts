// API tokens: made by the logged-in admin, shown once, limited to what
// their kind names, and dead the moment they are revoked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('API tokens', () => {
  let server: TestServer
  let cookie: string
  let upload: string
  let manage: string
  let photoId: string

  const asAdmin = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  /** A request the way a script makes it: a token, no cookie, no Origin header. */
  const withToken = (token: string, method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { 'authorization': `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const make = async (name: string, scope: string) => await (await asAdmin('POST', '/api/admin/tokens', { name, scope })).json() as { token: string, info: { id: string, prefix: string } }
  const message = async (response: Response) => (await response.json() as { message: string }).message

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(async () => { await server.stop() })

  it('makes a token that is shown once and stored only as a hash', async () => {
    const made = await make('Lightroom on my laptop', 'upload')
    upload = made.token
    expect(upload).toMatch(/^fb_[A-Za-z0-9_-]{43}$/)
    expect(made.info.prefix).toBe(upload.slice(0, 9))
    manage = (await make('Tidy-up script', 'manage')).token

    const listed = await (await get(server, '/api/admin/tokens', { cookie })).json() as { tokens: Record<string, unknown>[] }
    expect(listed.tokens.map(token => [token.name, token.scope, token.lastUsedAt])).toEqual([['Tidy-up script', 'manage', null], ['Lightroom on my laptop', 'upload', null]])
    // Neither the listing nor the database holds the token itself.
    expect(JSON.stringify(listed)).not.toContain(upload)
    const stored = JSON.stringify(query(server, 'select * from api_tokens'))
    expect(stored).not.toContain(upload)
    expect(stored).not.toContain(upload.slice(9))
  })

  it('lets a script upload with a token, with no login and no browser', async () => {
    const form = new FormData()
    form.append('file', new Blob([await imageBuffer({ seed: 41 }) as BlobPart]), 'from-script.jpg')
    const response = await fetch(`${server.url}/api/admin/photos`, { method: 'POST', headers: { authorization: `Bearer ${upload}` }, body: form })
    expect(response.status).toBe(200)
    photoId = (await response.json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, cookie)

    const list = await withToken(upload, 'GET', '/api/admin/photos')
    expect(list.status).toBe(200)
    expect((await list.json() as { photos: { id: string, status: string }[] }).photos).toMatchObject([{ id: photoId, status: 'ready' }])
    expect((await withToken(upload, 'GET', `/api/admin/photos/${photoId}`)).status).toBe(200)
    // The admin can see the token was used.
    const listed = await (await get(server, '/api/admin/tokens', { cookie })).json() as { tokens: { name: string, lastUsedAt: number | null }[] }
    expect(listed.tokens.find(token => token.name === 'Lightroom on my laptop')!.lastUsedAt).toBeGreaterThan(Date.now() - 60_000)
  })

  it('holds an upload token to uploading: it cannot edit, delete, or see anything else', async () => {
    const refused = [
      ['PATCH', `/api/admin/photos/${photoId}`, { title: 'Changed' }], ['DELETE', `/api/admin/photos/${photoId}`, undefined],
      ['GET', '/api/admin/settings', undefined], ['GET', '/api/admin/backup', undefined], ['GET', '/api/admin/albums', undefined], ['GET', '/api/admin/system', undefined],
    ] as const
    for (const [method, path, body] of refused) {
      const response = await withToken(upload, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(403)
      expect(await message(response)).toBe('The token "Lightroom on my laptop" is not allowed to do this. See what each kind of token can do under Admin, API tokens.')
    }
    expect((await (await get(server, `/api/admin/photos/${photoId}`, { cookie })).json() as { title: string | null }).title).not.toBe('Changed')
  })

  it('lets a manage token edit and delete photos and albums, and still nothing about the site', async () => {
    expect((await withToken(manage, 'PATCH', `/api/admin/photos/${photoId}`, { title: 'Named by a script' })).status).toBe(200)
    expect((await (await get(server, `/api/admin/photos/${photoId}`, { cookie })).json() as { title: string }).title).toBe('Named by a script')
    expect((await withToken(manage, 'POST', '/api/admin/albums', { title: 'Made by a script' })).status).toBe(201)

    for (const [method, path, body] of [
      ['GET', '/api/admin/settings', undefined], ['PUT', '/api/admin/site-text', { siteTitle: 'Taken over', tagline: '', language: 'en', text: {} }],
      ['PUT', '/api/admin/skins', { active: 'papier', options: {} }], ['GET', '/api/admin/backup', undefined], ['PUT', '/api/admin/seo', { indexing: false }],
    ] as const) expect((await withToken(manage, method, path, body)).status, `${method} ${path}`).toBe(403)
    expect((await (await get(server, '/api/site')).json() as { title: string }).title).toBe('Test Photos')
  })

  it('never lets a token see, make, or revoke tokens, or open the admin\'s pages', async () => {
    for (const token of [upload, manage]) {
      expect((await withToken(token, 'GET', '/api/admin/tokens')).status).toBe(403)
      expect((await withToken(token, 'POST', '/api/admin/tokens', { name: 'More power', scope: 'manage' })).status).toBe(403)
      // The pages are for a logged-in browser: a token is not a login.
      const page = await fetch(`${server.url}/admin`, { headers: { authorization: `Bearer ${token}`, accept: 'text/html' }, redirect: 'manual' })
      expect(page.status).toBe(401)
    }
    expect((await get(server, '/api/admin/tokens', { cookie })).status).toBe(200)
  })

  it('judges a request by its token alone: a login cookie sent with it does not widen what it may do', async () => {
    const response = await fetch(`${server.url}/api/admin/settings`, { headers: { authorization: `Bearer ${upload}`, cookie } })
    expect(response.status).toBe(403)
  })

  it('refuses a token that is wrong, malformed, or revoked', async () => {
    expect((await withToken('fb_' + 'A'.repeat(43), 'GET', '/api/admin/photos')).status).toBe(401)
    expect(await message(await withToken(upload.slice(0, -1) + (upload.endsWith('A') ? 'B' : 'A'), 'GET', '/api/admin/photos'))).toBe('This token is not valid. It may have been revoked.')
    // Not a token at all: treated as no login, and a changing request without an Origin is turned away.
    expect((await fetch(`${server.url}/api/admin/photos`, { headers: { authorization: 'Bearer something-else' } })).status).toBe(401)
    expect((await fetch(`${server.url}/api/admin/photos`, { method: 'POST', headers: { authorization: 'Bearer something-else' } })).status).toBe(403)

    const listed = await (await get(server, '/api/admin/tokens', { cookie })).json() as { tokens: { id: string, name: string }[] }
    const id = listed.tokens.find(token => token.name === 'Lightroom on my laptop')!.id
    expect((await asAdmin('DELETE', `/api/admin/tokens/${id}`)).status).toBe(200)
    expect((await withToken(upload, 'GET', '/api/admin/photos')).status).toBe(401)
    // The other token carries on.
    expect((await withToken(manage, 'GET', '/api/admin/photos')).status).toBe(200)
    expect((await asAdmin('DELETE', `/api/admin/tokens/${id}`)).status).toBe(404)
  })

  it('needs a name and a kind, and a logged-in admin, to make one', async () => {
    const bad = await asAdmin('POST', '/api/admin/tokens', { name: '   ', scope: 'everything' })
    expect(bad.status).toBe(422)
    expect(Object.keys((await bad.json() as { errors: object }).errors).sort()).toEqual(['name', 'scope'])
    expect((await get(server, '/api/admin/tokens')).status).toBe(401)
    expect((await fetch(`${server.url}/api/admin/tokens`, { method: 'POST', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{"name":"x","scope":"manage"}' })).status).toBe(401)
  })
})
