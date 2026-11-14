import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, post, sessionCookie, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

const login = (server: TestServer, credentials: { username: string, password: string } = ADMIN) =>
  post(server, '/api/auth/login', credentials)

describe('the admin area', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('rejects an unauthenticated API request with 401', async () => {
    const response = await get(server, '/api/admin/overview')
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('rejects an unauthenticated API request to a route that does not exist with 401, not 404', async () => {
    expect((await get(server, '/api/admin/nothing-here')).status).toBe(401)
  })

  it.each(['/admin', '/admin/anything'])('redirects an unauthenticated visitor from %s to /login', async (path) => {
    const response = await get(server, path)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
  })

  it('serves the overview to the session created by setup', async () => {
    const response = await get(server, '/api/admin/overview', { cookie })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ siteTitle: 'Test Photos', username: ADMIN.username })
  })

  it('rejects a cookie that was tampered with', async () => {
    const forged = cookie.slice(0, -4) + (cookie.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect((await get(server, '/api/admin/overview', { cookie: forged })).status).toBe(401)
  })

  it('reports who is logged in at /api/auth/me', async () => {
    expect(await (await get(server, '/api/auth/me', { cookie })).json()).toEqual({ user: { username: ADMIN.username } })
    expect(await (await get(server, '/api/auth/me')).json()).toEqual({ user: null })
  })

  it('logs in with the right password and records the time', async () => {
    const before = Date.now()
    const response = await login(server)
    expect(response.status).toBe(200)
    const fresh = sessionCookie(response)!
    expect((await get(server, '/api/admin/overview', { cookie: fresh })).status).toBe(200)
    const [user] = query<{ last_login_at: number }>(server, 'select last_login_at from users')
    expect(user!.last_login_at).toBeGreaterThanOrEqual(before)
  })

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const wrongPassword = await login(server, { username: ADMIN.username, password: 'not the password' })
    const unknownUser = await login(server, { username: 'nobody', password: 'not the password' })
    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(await wrongPassword.json()).toEqual(await unknownUser.json())
    expect(sessionCookie(wrongPassword)).toBeUndefined()
  })

  it('sets an HttpOnly, SameSite=Lax cookie without Secure on localhost', async () => {
    const setCookie = (await login(server)).headers.getSetCookie().find(c => c.startsWith('fotobogen='))!
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\//i)
    expect(setCookie).toMatch(/Max-Age=2592000/i)
    expect(setCookie).not.toMatch(/Secure/i)
  })

  it('sets the Secure flag when reached by any other host name', async () => {
    const setCookie = await new Promise<string[]>((resolve, reject) => {
      const body = JSON.stringify(ADMIN)
      const req = request(server.url + '/api/auth/login', {
        method: 'POST',
        headers: {
          'host': 'photos.example.com',
          'origin': 'https://photos.example.com',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, res => { res.resume(); resolve(res.headers['set-cookie'] ?? []) })
      req.on('error', reject)
      req.end(body)
    })
    expect(setCookie.find(c => c.startsWith('fotobogen='))).toMatch(/; Secure/i)
  })

  it('keeps a session valid across a server restart', async () => {
    await server.restart()
    expect((await get(server, '/api/admin/overview', { cookie })).status).toBe(200)
  })

  it('logging out ends the session in the browser', async () => {
    const fresh = sessionCookie(await login(server))!
    const response = await post(server, '/api/auth/logout', {}, { cookie: fresh })
    expect(response.status).toBe(200)
    const cleared = response.headers.getSetCookie().find(c => c.startsWith('fotobogen='))!
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })

  it('redirects a logged-in admin away from /login', async () => {
    // The earlier logout ended every session, so log in again first.
    const fresh = sessionCookie(await login(server))!
    const response = await get(server, '/login', { cookie: fresh })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/admin')
  })
})

describe('login', () => {
  it('accepts a password with markup, quotes, and non-ASCII characters', async () => {
    const server = await startServer()
    try {
      const password = '<script>"\'pässwörd 日本'
      await completeSetup(server, { password })
      expect((await login(server, { username: ADMIN.username, password })).status).toBe(200)
    }
    finally { await server.stop() }
  })

  it('blocks the sixth attempt after five failures, even with the right password', async () => {
    const server = await startServer()
    try {
      await completeSetup(server)
      for (let i = 0; i < 5; i++) {
        expect((await login(server, { username: ADMIN.username, password: `wrong password ${i}` })).status).toBe(401)
      }
      const blocked = await login(server)
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await blocked.json()).message).toMatch(/try again in 15 minutes/i)
    }
    finally { await server.stop() }
  })

  it('forgets earlier failures after a successful login', async () => {
    const server = await startServer()
    try {
      await completeSetup(server)
      for (let i = 0; i < 4; i++) await login(server, { username: ADMIN.username, password: 'wrong password' })
      expect((await login(server)).status).toBe(200)
      for (let i = 0; i < 4; i++) await login(server, { username: ADMIN.username, password: 'wrong password' })
      expect((await login(server)).status).toBe(200)
    }
    finally { await server.stop() }
  })
})

describe('hardening', () => {
  it('counts attempts made at the same moment: a burst of 20 wrong passwords tests at most 5', async () => {
    const server = await startServer()
    try {
      await completeSetup(server)
      const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        login(server, { username: ADMIN.username, password: `burst guess ${i}` })))
      const statuses = responses.map(r => r.status)
      expect(statuses.filter(s => s === 401)).toHaveLength(5)
      expect(statuses.filter(s => s === 429)).toHaveLength(15)
    }
    finally { await server.stop() }
  })

  it('counts setup-token attempts made at the same moment', async () => {
    const server = await startServer()
    try {
      const responses = await Promise.all(Array.from({ length: 20 }, () =>
        post(server, '/api/setup/verify', { token: 'f'.repeat(32) })))
      expect(responses.filter(r => r.status === 401)).toHaveLength(5)
    }
    finally { await server.stop() }
  })

  it('a cookie copied before logout stops working after logout', async () => {
    const server = await startServer()
    try {
      const cookie = await completeSetup(server)
      expect((await get(server, '/api/admin/overview', { cookie })).status).toBe(200)
      await post(server, '/api/auth/logout', {}, { cookie })
      expect((await get(server, '/api/admin/overview', { cookie })).status).toBe(401)
      expect((await login(server)).status).toBe(200)
    }
    finally { await server.stop() }
  })
})
