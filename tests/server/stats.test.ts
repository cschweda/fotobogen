import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('visitor statistics', () => {
  let server: TestServer
  let cookie: string
  const save = (body: unknown, headers: Record<string, string> = {}) => fetch(`${server.url}/api/admin/stats`, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'origin': server.url, cookie, ...headers }, body: JSON.stringify(body),
  })
  const page = async (path: string, headers: Record<string, string> = {}) => {
    const response = await get(server, path, headers)
    return { html: await response.text(), policy: response.headers.get('content-security-policy') ?? '', status: response.status }
  }
  const PLAUSIBLE = { provider: 'plausible', plausibleScript: 'https://plausible.io/js/pa-AbC123.js' }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('are off to begin with: pages load nothing from anywhere else', async () => {
    const { html, policy } = await page('/')
    expect(html).not.toContain('data-fb-stats')
    expect(html).not.toMatch(/<script[^>]+src="https?:/)
    expect(policy).not.toContain('plausible')
    expect(await (await get(server, '/api/admin/stats', { cookie })).json()).toMatchObject({ settings: { provider: 'off' } })
  })

  it('put the chosen service\'s script on public pages, and let the page report to that service only', async () => {
    expect((await save(PLAUSIBLE)).status).toBe(200)
    for (const path of ['/', '/albums', '/slideshow']) {
      const { html, policy } = await page(path)
      const nonce = /script-src[^;]*'nonce-([^']+)'/.exec(policy)?.[1]
      expect(nonce, path).toBeTruthy()
      expect(html, path).toContain(`<script nonce="${nonce}" defer src="https://plausible.io/js/pa-AbC123.js" data-fb-stats></script>`)
      expect(html, path).toContain(`<script nonce="${nonce}">window.plausible=`)
      expect(policy, path).toMatch(/connect-src 'self' https:\/\/plausible\.io(;|$)/)
      expect(policy, path).toMatch(/img-src [^;]*https:\/\/plausible\.io/)
      // Still only scripts the server itself wrote.
      expect(policy, path).toMatch(/script-src 'self' 'strict-dynamic' 'nonce-/)
    }
  })

  it('never on the login or the admin, and never for someone who is logged in', async () => {
    for (const [path, headers] of [['/login', {}], ['/admin', { cookie }], ['/', { cookie }], ['/albums', { cookie }]] as const) {
      const { html, policy } = await page(path, headers)
      expect(html, path).not.toContain('plausible')
      expect(policy, path).not.toContain('plausible')
    }
  })

  it('can only be changed by the logged-in owner, never with an API token', async () => {
    const made = await fetch(`${server.url}/api/admin/tokens`, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': server.url, cookie }, body: JSON.stringify({ name: 'script', scope: 'manage' }) })
    const { token } = await made.json() as { token: string }
    const withToken = await fetch(`${server.url}/api/admin/stats`, { method: 'PUT', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` }, body: JSON.stringify({ provider: 'off' }) })
    expect(withToken.status).toBe(403)
    expect((await fetch(`${server.url}/api/admin/stats`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(403)
    expect((await fetch(`${server.url}/api/admin/stats`, { method: 'PUT', headers: { 'content-type': 'application/json', 'origin': server.url }, body: JSON.stringify({ provider: 'off' }) })).status).toBe(401)
    expect((await page('/')).html).toContain('plausible')
  })

  it('refuse anything that is not an address or an ID, and keep what was there', async () => {
    const response = await save({ provider: 'other', otherScript: 'https://a.example/s.js"></script><script>alert(1)</script>', otherAttributes: [{ name: 'onload', value: 'alert(1)' }] })
    expect(response.status).toBe(422)
    expect((await response.json() as { errors: Record<string, string> }).errors).toHaveProperty('otherScript')
    expect((await page('/')).html).toContain('https://plausible.io/js/pa-AbC123.js')
  })

  it('put nothing odd on a page even if the database is edited by hand', async () => {
    const Database = (await import('better-sqlite3')).default
    const { join } = await import('node:path')
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.pragma('busy_timeout = 5000')
    db.prepare(`update settings set value = ? where key = 'stats.settings'`).run(JSON.stringify({ provider: 'other', otherScript: 'https://a.example/s.js"><script>alert(1)</script>', otherAttributes: [] }))
    db.close()
    expect(query(server, `select count(*) as n from settings where key = 'stats.settings'`)).toEqual([{ n: 1 }])
    const { html } = await page('/')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('data-fb-stats')
  })

  it('go away again when switched off', async () => {
    expect((await save({ provider: 'off' })).status).toBe(200)
    const { html, policy } = await page('/')
    expect(html).not.toContain('data-fb-stats')
    expect(policy).not.toContain('connect-src')
  })
})
