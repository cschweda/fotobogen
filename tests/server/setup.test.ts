import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, post, sessionCookie, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query, setupAnswers } from '../helpers/setup.ts'

const WRONG_TOKEN = '0'.repeat(32)

describe('a fresh install', () => {
  let server: TestServer
  beforeAll(async () => { server = await startServer() })
  afterAll(() => server.stop())

  it.each(['/', '/admin', '/login', '/photo/anything'])('redirects %s to /setup', async (path) => {
    const response = await get(server, path)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/setup')
  })

  it('still answers the health check', async () => {
    expect((await get(server, '/api/health')).status).toBe(200)
  })

  it('answers other API routes with 503 instead of a redirect', async () => {
    const response = await get(server, '/api/admin/overview')
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('rejects a wrong setup token', async () => {
    const response = await post(server, '/api/setup/verify', { token: WRONG_TOKEN })
    expect(response.status).toBe(401)
    expect((await response.json()).message).toMatch(/token/i)
  })

  it('accepts the printed setup token', async () => {
    expect((await post(server, '/api/setup/verify', { token: server.token() })).status).toBe(200)
  })

  it('rejects a POST that carries no Origin header', async () => {
    const response = await fetch(server.url + '/api/setup/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: server.token() }),
    })
    expect(response.status).toBe(403)
  })

  it('rejects a POST from another site', async () => {
    const response = await post(server, '/api/setup/verify', { token: server.token() }, { origin: 'https://evil.example' })
    expect(response.status).toBe(403)
  })

  it('refuses to complete setup with a wrong token', async () => {
    const response = await post(server, '/api/setup/complete', setupAnswers(server, { token: WRONG_TOKEN }))
    expect(response.status).toBe(401)
    expect(query(server, 'select id from users')).toHaveLength(0)
  })

  it('names the field when the password is shorter than 12 characters', async () => {
    const response = await post(server, '/api/setup/complete', setupAnswers(server, { password: 'elevenchars' }))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(Object.keys(body.errors)).toEqual(['password'])
    expect(body.errors.password).toMatch(/12/)
    expect(query(server, 'select id from users')).toHaveLength(0)
  })

  it('names every invalid field at once', async () => {
    const response = await post(server, '/api/setup/complete', setupAnswers(server, { siteTitle: ' ', username: 'a b', grid: 'spiral' }))
    expect(response.status).toBe(422)
    expect(Object.keys((await response.json()).errors).sort()).toEqual(['grid', 'siteTitle', 'username'])
  })

  describe('once setup is completed', () => {
    let cookie: string | undefined
    let completion: Response
    beforeAll(async () => {
      completion = await post(server, '/api/setup/complete', setupAnswers(server, { samples: true }))
      cookie = sessionCookie(completion)
    })

    it('succeeds and logs the admin in', () => {
      expect(completion.status).toBe(200)
      expect(cookie).toBeTruthy()
    })

    it('creates one admin user with a hashed password', () => {
      const users = query<{ username: string, password_hash: string, role: string }>(server, 'select username, password_hash, role from users')
      expect(users).toHaveLength(1)
      expect(users[0]).toMatchObject({ username: ADMIN.username, role: 'admin' })
      expect(users[0]!.password_hash).toMatch(/^scrypt\$/)
      expect(users[0]!.password_hash).not.toContain(ADMIN.password)
    })

    it('stores the wizard answers and the default settings', () => {
      const rows = query<{ key: string, value: string }>(server, 'select key, value from settings')
      const settings = Object.fromEntries(rows.map(row => [row.key, JSON.parse(row.value)]))
      // Bookkeeping the server writes by itself once a minute: when it last looked for photos that went live.
      delete settings['webhooks.last_scan']
      expect(settings).toEqual({
        'site.title': 'Test Photos',
        'site.tagline': 'Pictures of things',
        'site.setup_complete': true,
        'layout.grid': 'masonry',
        'layout.photo_view': 'modal',
        'samples.requested': true,
        'skin.active': 'swiss',
        'privacy.show_exif': true,
        'privacy.show_location': false,
        'privacy.allow_original_download': false,
      })
    })

    it('deletes the setup token file', () => {
      expect(existsSync(join(server.dataDir, 'setup-token'))).toBe(false)
    })

    it('cannot be completed a second time', async () => {
      const response = await post(server, '/api/setup/complete', setupAnswers(server, { username: 'intruder' }))
      expect(response.status).toBe(404)
      expect(query(server, 'select id from users')).toHaveLength(1)
    })

    it.each(['/setup', '/setup/anything'])('answers %s with 404', async (path) => {
      expect((await get(server, path)).status).toBe(404)
    })

    it('answers the setup API with 404', async () => {
      expect((await post(server, '/api/setup/verify', { token: WRONG_TOKEN })).status).toBe(404)
    })

    it('no longer redirects the site to /setup', async () => {
      expect((await get(server, '/')).status).toBe(200)
    })

    it('stays set up, and prints no token, after a restart', async () => {
      await server.restart()
      expect(server.token()).toBeUndefined()
      expect((await get(server, '/setup')).status).toBe(404)
      expect(existsSync(join(server.dataDir, 'setup-token'))).toBe(false)
    })
  })
})

describe('setup token attempts are rate limited', () => {
  it('blocks the sixth attempt after five failures, even with the right token', async () => {
    const server = await startServer()
    try {
      for (let i = 0; i < 5; i++) {
        expect((await post(server, '/api/setup/verify', { token: WRONG_TOKEN })).status).toBe(401)
      }
      const blocked = await post(server, '/api/setup/verify', { token: server.token() })
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await post(server, '/api/setup/complete', setupAnswers(server))).status).toBe(429)
    }
    finally { await server.stop() }
  })

  it('ignores a spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const server = await startServer()
    try {
      for (let i = 0; i < 5; i++) {
        await post(server, '/api/setup/verify', { token: WRONG_TOKEN }, { 'x-forwarded-for': `203.0.113.${i}` })
      }
      const response = await post(server, '/api/setup/verify', { token: server.token() }, { 'x-forwarded-for': '203.0.113.99' })
      expect(response.status).toBe(429)
    }
    finally { await server.stop() }
  })

  it('counts each forwarded address separately when TRUST_PROXY=1', async () => {
    const server = await startServer({ env: { TRUST_PROXY: '1' } })
    try {
      for (let i = 0; i < 5; i++) {
        await post(server, '/api/setup/verify', { token: WRONG_TOKEN }, { 'x-forwarded-for': '203.0.113.7' })
      }
      expect((await post(server, '/api/setup/verify', { token: server.token() }, { 'x-forwarded-for': '203.0.113.7' })).status).toBe(429)
      expect((await post(server, '/api/setup/verify', { token: server.token() }, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(200)
    }
    finally { await server.stop() }
  })
})

describe('two people finishing setup at the same moment', () => {
  it('leaves exactly one user', async () => {
    const server = await startServer()
    try {
      const responses = await Promise.all([
        post(server, '/api/setup/complete', setupAnswers(server, { username: 'first' })),
        post(server, '/api/setup/complete', setupAnswers(server, { username: 'second' })),
      ])
      expect(responses.map(r => r.status).sort()).toEqual([200, 404])
      expect(query(server, 'select id from users')).toHaveLength(1)
    }
    finally { await server.stop() }
  })
})

describe('completeSetup helper', () => {
  it('returns a session cookie', async () => {
    const server = await startServer()
    try {
      expect(await completeSetup(server)).toMatch(/^fotobogen=/)
    }
    finally { await server.stop() }
  })
})

describe('GET /api/site', () => {
  it('returns what the public pages need, and nothing private', async () => {
    const server = await startServer()
    try {
      await completeSetup(server)
      const response = await get(server, '/api/site')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        title: 'Test Photos', tagline: 'Pictures of things', grid: 'masonry', photoView: 'modal', skinVersion: expect.stringMatching(/^[0-9a-f]{10}$/), mode: 'dark', hasAlbums: false,
        // The site's words and search settings, all at their defaults on a new site.
        language: 'en', text: {},
        seo: { homeTitle: '', titlePattern: '{page} | {site}', description: '', indexing: true, siteUrl: '', author: '', twitter: '', googleVerification: '', bingVerification: '', card: null },
      })
    }
    finally { await server.stop() }
  })
})
