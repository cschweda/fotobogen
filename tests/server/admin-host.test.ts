// The admin at an address of its own (ADMIN_HOST). Here the two addresses are
// two names for this machine: localhost for the public site, 127.0.0.1 for the admin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, post, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'

describe('the admin at an address of its own', () => {
  let site: TestServer
  let admin: TestServer
  let cookie: string
  beforeAll(async () => {
    site = await startServer({ env: port => ({ SITE_URL: `http://localhost:${port}`, ADMIN_HOST: `127.0.0.1:${port}` }) })
    admin = { ...site, url: site.url.replace('localhost', '127.0.0.1') }
    cookie = await completeSetup(admin)
  })
  afterAll(() => site.stop())

  it('answers for the admin, the login, and their API only at the admin\'s address', async () => {
    expect((await get(admin, '/api/admin/settings', { cookie })).status).toBe(200)
    expect((await get(admin, '/login')).status).toBe(200)
    // At the public address the API is simply not there, even for a request carrying the login.
    for (const path of ['/api/admin/settings', '/api/auth/me']) {
      const response = await get(site, path, { cookie })
      expect(response.status, path).toBe(404)
      expect((await response.json() as { message: string }).message).toBe(`The admin of this site is at ${admin.url}.`)
    }
    expect((await post(site, '/api/auth/login', ADMIN)).status).toBe(404)
    expect((await post(site, '/api/admin/tokens', { name: 'x', scope: 'manage' }, { cookie })).status).toBe(404)
    // Its pages are sent on to the right address.
    const login = await get(site, '/login')
    expect([login.status, login.headers.get('location')]).toEqual([302, `${admin.url}/login`])
    const page = await get(site, '/admin/photos?x=1', { cookie })
    expect([page.status, page.headers.get('location')]).toEqual([302, `${admin.url}/admin/photos?x=1`])
  })

  it('answers for the public pages only at the site\'s address', async () => {
    expect((await get(site, '/')).status).toBe(200)
    const there = await get(admin, '/albums', { cookie })
    expect([there.status, there.headers.get('location')]).toEqual([302, `${site.url}/albums`])
    const door = await get(admin, '/')
    expect([door.status, door.headers.get('location')]).toEqual([302, `${admin.url}/admin`])
    for (const path of ['/api/site', '/api/health', '/skin.css']) {
      expect((await get(site, path)).status, path).toBe(200)
      expect((await get(admin, path)).status, path).toBe(200)
    }
  })

  it('shows the slideshow for other sites at the site\'s address only, never at the admin\'s', async () => {
    const on = await fetch(`${admin.url}/api/admin/embed`, { method: 'PUT', headers: { 'content-type': 'application/json', 'origin': admin.url, cookie }, body: '{"enabled":true}' })
    expect(on.status).toBe(200)
    // The code the admin page gives points at the public site.
    expect(await (await get(admin, '/api/admin/embed', { cookie })).json()).toMatchObject({ enabled: true, address: site.url })
    const atSite = await get(site, '/embed/slideshow')
    expect(atSite.status).toBe(200)
    expect(atSite.headers.get('content-security-policy')).toMatch(/frame-ancestors \*(;|$)/)
    // Nothing that can be framed by another site is ever served from the address that holds the login.
    const atAdmin = await get(admin, '/embed/slideshow')
    expect(atAdmin.status).toBe(302)
    expect(atAdmin.headers.get('location')).toBe(`${site.url}/embed/slideshow`)
    expect(atAdmin.headers.get('content-security-policy') ?? '').not.toContain('frame-ancestors *')
    // And it cannot be switched from the public address.
    expect((await fetch(`${site.url}/api/admin/embed`, { method: 'PUT', headers: { 'content-type': 'application/json', 'origin': site.url, cookie }, body: '{"enabled":false}' })).status).toBe(404)
  })

  it('keeps the login for the admin\'s address alone', async () => {
    const response = await post(admin, '/api/auth/login', ADMIN)
    expect(response.status).toBe(200)
    // No Domain on the cookie: the browser sends it to the admin's name and to no other.
    expect(response.headers.getSetCookie().join('\n')).not.toMatch(/domain=/i)
  })

  it('still counts visits on the public pages, where the login never goes', async () => {
    const saved = await fetch(`${admin.url}/api/admin/stats`, { method: 'PUT', headers: { 'content-type': 'application/json', 'origin': admin.url, cookie }, body: JSON.stringify({ provider: 'plausible', plausibleScript: 'https://plausible.io/js/pa-AbC123.js' }) })
    expect(saved.status).toBe(200)
    expect(await (await get(site, '/')).text()).toContain('https://plausible.io/js/pa-AbC123.js')
    expect(await (await get(admin, '/login')).text()).not.toContain('plausible')
  })
})

describe('settings that go together', () => {
  it('refuses to start with an admin address and no site address, and says what to set', async () => {
    const server = await startServer({ env: { ADMIN_HOST: 'admin.photos.example.com' }, waitForHealth: false })
    try {
      expect(await server.exited).toBe(1)
      expect(server.output()).toContain('ADMIN_HOST is set, so SITE_URL must be set too')
    }
    finally {
      await server.stop()
    }
  })
})

describe('the admin and the login', () => {
  it('are never shown inside a frame, not even one of the site\'s own pages', async () => {
    const server = await startServer()
    try {
      const cookie = await completeSetup(server)
      for (const path of ['/login', '/admin']) {
        const response = await get(server, path, path === '/admin' ? { cookie } : {})
        expect(response.headers.get('content-security-policy'), path).toContain('frame-ancestors \'none\'')
        expect(response.headers.get('x-frame-options'), path).toBe('DENY')
      }
      // A public page may still be framed by the site itself, as before.
      expect((await get(server, '/')).headers.get('content-security-policy')).toContain('frame-ancestors \'self\'')
    }
    finally {
      await server.stop()
    }
  })
})
