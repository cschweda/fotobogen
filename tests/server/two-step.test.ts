import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { totpAt } from '../../server/core/totp.ts'
import { baseEnv, get, post, sessionCookie, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

interface Details { name: string, key: string, uri: string, qr: string[], known: boolean }
const plain = (key: string) => key.replace(/\s/g, '')

describe('two-step login', () => {
  let server: TestServer
  let cookie: string
  let key = ''
  let codes: string[] = []
  const as = (path: string, body: unknown, headers: Record<string, string> = {}) => post(server, path, body, { cookie, ...headers })
  const login = (extra: Record<string, unknown> = {}) => post(server, '/api/auth/login', { ...ADMIN, ...extra })
  // Wrong passwords and wrong codes count against one limit of five; a right password starts the count again.
  const startCountAgain = async () => expect((await as('/api/admin/two-step/reveal', { password: ADMIN.password })).status).toBe(200)

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('is off to begin with: the password alone logs in', async () => {
    expect(await (await get(server, '/api/admin/two-step', { cookie })).json()).toEqual({ enabled: false, name: 'Fotobogen (Test Photos)', codesLeft: 0, codesTotal: 0 })
    expect((await login()).status).toBe(200)
  })

  it('is for the logged-in owner alone: not a visitor, not an API token, not a demo visitor', async () => {
    const { token } = await (await as('/api/admin/tokens', { name: 'script', scope: 'manage' })).json() as { token: string }
    for (const path of ['begin', 'enable', 'reveal', 'codes', 'disable']) {
      expect((await post(server, `/api/admin/two-step/${path}`, { password: ADMIN.password })).status, path).toBe(401)
      expect((await post(server, `/api/admin/two-step/${path}`, { password: ADMIN.password }, { authorization: `Bearer ${token}` })).status, path).toBe(403)
    }
    expect((await get(server, '/api/admin/two-step')).status).toBe(401)
    expect((await get(server, '/api/admin/two-step', { authorization: `Bearer ${token}` })).status).toBe(403)
  })

  it('shows the key only to someone who gives the password again', async () => {
    expect((await as('/api/admin/two-step/begin', {})).status).toBe(401)
    expect((await as('/api/admin/two-step/begin', { password: 'not the password' })).status).toBe(401)
    const response = await as('/api/admin/two-step/begin', { password: ADMIN.password })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const details = await response.json() as Details
    key = plain(details.key)
    expect(key).toMatch(/^[A-Z2-7]{32}$/)
    expect(details.known).toBe(false)
    expect(details.name).toBe('Fotobogen (Test Photos)')
    expect(details.uri).toBe(`otpauth://totp/Fotobogen:Test%20Photos?secret=${key}&issuer=Fotobogen`)
    // A square of dark and light cells: the QR code for that address.
    expect(details.qr.length).toBeGreaterThan(20)
    for (const row of details.qr) expect(row).toMatch(new RegExp(`^[01]{${details.qr.length}}$`))
    // Asking again gives the same key: nothing is replaced behind a phone that already holds it.
    expect(plain((await (await as('/api/admin/two-step/begin', { password: ADMIN.password })).json() as Details).key)).toBe(key)
    // Nothing is on yet.
    expect(query(server, 'select totp_secret from users')[0]!.totp_secret).toBeNull()
  })

  it('is switched on only by a code from that key, and then signs out every other browser', async () => {
    const other = sessionCookie(await login())!
    expect((await as('/api/admin/two-step/enable', { code: '000000' })).status).toBe(422)
    expect((await as('/api/admin/two-step/enable', {})).status).toBe(422)
    const response = await as('/api/admin/two-step/enable', { code: totpAt(key, Date.now()) })
    expect(response.status).toBe(200)
    codes = (await response.json() as { codes: string[] }).codes
    expect(codes).toHaveLength(10)
    const fresh = sessionCookie(response)!
    expect((await get(server, '/api/admin/two-step', { cookie: other })).status).toBe(401)
    expect((await get(server, '/api/admin/two-step', { cookie })).status).toBe(401)
    cookie = fresh
    expect(await (await get(server, '/api/admin/two-step', { cookie })).json()).toMatchObject({ enabled: true, codesLeft: 10, codesTotal: 10 })
    expect((await as('/api/admin/two-step/enable', { code: totpAt(key, Date.now()) })).status).toBe(409)
  })

  it('then asks for a code after the password, and says nothing about codes to a wrong password', async () => {
    await startCountAgain()
    const wrong = await login({ password: 'not the password', code: totpAt(key, Date.now() + 30_000) })
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ message: 'Wrong username or password.' })
    const first = await login()
    expect(first.status).toBe(401)
    expect(await first.json()).toMatchObject({ needsCode: true })
    expect(sessionCookie(first)).toBeUndefined()
    const bad = await login({ code: '123456' })
    expect(bad.status).toBe(401)
    expect(sessionCookie(bad)).toBeUndefined()
  })

  it('accepts each code from the app once', async () => {
    await startCountAgain()
    // The code that switched it on has been used: it does not also log in.
    expect((await login({ code: totpAt(key, Date.now()) })).status).toBe(401)
    const next = totpAt(key, Date.now() + 30_000)
    const ok = await login({ code: next })
    expect(ok.status).toBe(200)
    expect(sessionCookie(ok)).toBeTruthy()
    expect((await login({ code: next })).status).toBe(401)
  })

  it('accepts a backup code in place of the app, once', async () => {
    const ok = await login({ code: codes[0]!.toUpperCase().replace('-', ' ') })
    expect(ok.status).toBe(200)
    expect((await login({ code: codes[0] })).status).toBe(401)
    expect(await (await get(server, '/api/admin/two-step', { cookie })).json()).toMatchObject({ codesLeft: 9, codesTotal: 10 })
  })

  it('shows the key and the same codes again for the password, with the used one marked', async () => {
    expect((await as('/api/admin/two-step/reveal', { password: 'not the password' })).status).toBe(401)
    const shown = await (await as('/api/admin/two-step/reveal', { password: ADMIN.password })).json() as Details & { codes: { code: string, used: boolean }[] }
    expect(plain(shown.key)).toBe(key)
    expect(shown.codes.map(entry => entry.code)).toEqual(codes)
    expect(shown.codes.filter(entry => entry.used).map(entry => entry.code)).toEqual([codes[0]])
  })

  it('makes new backup codes on request, and the old ones stop working', async () => {
    const made = (await (await as('/api/admin/two-step/codes', { password: ADMIN.password })).json() as { codes: { code: string }[] }).codes.map(entry => entry.code)
    expect(made).toHaveLength(10)
    expect(made.some(code => codes.includes(code))).toBe(false)
    expect((await login({ code: codes[1] })).status).toBe(401)
    expect((await login({ code: made[0] })).status).toBe(200)
    codes = made
  })

  it('stops guessing at codes the way it stops guessing at passwords', async () => {
    const guesser = await startServer()
    try {
      const owner = await completeSetup(guesser)
      const own = plain((await (await post(guesser, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie: owner })).json() as Details).key)
      expect((await post(guesser, '/api/admin/two-step/enable', { code: totpAt(own, Date.now()) }, { cookie: owner })).status).toBe(200)
      const statuses: number[] = []
      for (let guess = 0; guess < 7; guess++) statuses.push((await post(guesser, '/api/auth/login', { ...ADMIN, code: String(100000 + guess) })).status)
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
      expect(statuses.slice(5)).toEqual([429, 429])
      // Even the right code is refused now, until the wait is over.
      expect((await post(guesser, '/api/auth/login', { ...ADMIN, code: totpAt(own, Date.now() + 30_000) })).status).toBe(429)
    }
    finally {
      await guesser.stop()
    }
  })

  it('limits wrong codes for the account as a whole, so guessing from many addresses at once gets nowhere', async () => {
    // Found by the audit of 17 November 2026: the limit on wrong codes was per address only.
    const guesser = await startServer({ env: { TRUST_PROXY: '1' } })
    const from = (address: string, code: string) => post(guesser, '/api/auth/login', { ...ADMIN, code }, { 'x-forwarded-for': address })
    try {
      const owner = await completeSetup(guesser)
      const own = plain((await (await post(guesser, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie: owner })).json() as Details).key)
      expect((await post(guesser, '/api/admin/two-step/enable', { code: totpAt(own, Date.now()) }, { cookie: owner })).status).toBe(200)
      const statuses: number[] = []
      for (let guess = 0; guess < 12; guess++) statuses.push((await from(`203.0.113.${guess + 1}`, String(100000 + guess))).status)
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401))
      expect(statuses.slice(10)).toEqual([429, 429])
      // From an address never seen before, the right code and a backup code are refused too, until the wait is over.
      const blocked = await from('198.51.100.7', totpAt(own, Date.now() + 30_000))
      expect(blocked.status).toBe(429)
      expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/)
      // A wrong password from a new address is still told only that: nothing about codes or limits.
      expect(await (await post(guesser, '/api/auth/login', { ...ADMIN, password: 'not the password' }, { 'x-forwarded-for': '198.51.100.8' })).json()).toEqual({ message: 'Wrong username or password.' })
    }
    finally {
      await guesser.stop()
    }
  })

  it('refuses a demo visitor', async () => {
    const demo = await startServer({ env: { DEMO_MODE: '1' } })
    try {
      await completeSetup(demo)
      const visitor = sessionCookie(await post(demo, '/api/auth/login', { username: 'demo', password: 'demo' }))!
      expect((await get(demo, '/api/admin/two-step', { cookie: visitor })).status).toBe(403)
      for (const path of ['begin', 'enable', 'reveal', 'codes', 'disable']) expect((await post(demo, `/api/admin/two-step/${path}`, { password: 'demo' }, { cookie: visitor })).status, path).toBe(403)
    }
    finally {
      await demo.stop()
    }
  })

  it('is switched off again for the password, and the password alone logs in', async () => {
    expect((await as('/api/admin/two-step/disable', {})).status).toBe(401)
    expect((await as('/api/admin/two-step/disable', { password: ADMIN.password })).status).toBe(200)
    expect(query(server, 'select totp_secret, totp_last_step, backup_codes from users')[0]).toEqual({ totp_secret: null, totp_last_step: null, backup_codes: null })
    expect((await login()).status).toBe(200)
    expect((await as('/api/admin/two-step/reveal', { password: ADMIN.password })).status).toBe(409)
  })
})

describe('one key for every Fotobogen on a server', () => {
  it('gives a second site the key the first one made, so the authenticator app keeps one entry', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fb-shared-')), 'two-step-key.json')
    const env = { TWO_STEP_KEY_FILE: file }
    const first = await startServer({ env })
    const second = await startServer({ env })
    try {
      const one = await completeSetup(first, { siteTitle: 'First' })
      const two = await completeSetup(second, { siteTitle: 'Second' })
      const begun = await (await post(first, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie: one })).json() as Details
      expect(begun.known).toBe(false)
      // Named after the server, not the site: the entry belongs to both.
      expect(begun.name).toBe(`Fotobogen (${hostname()})`)
      // Until a code has been accepted, the next site still shows the key: no phone is known to hold it.
      expect((await (await post(second, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie: two })).json() as Details).known).toBe(false)
      const key = plain(begun.key)
      expect((await post(first, '/api/admin/two-step/enable', { code: totpAt(key, Date.now()) }, { cookie: one })).status).toBe(200)

      const again = await (await post(second, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie: two })).json() as Details
      expect(plain(again.key)).toBe(key)
      expect(again.known).toBe(true)
      expect(again.name).toBe(begun.name)
      // The same phone entry switches the second site on. Each site counts its own used codes.
      expect((await post(second, '/api/admin/two-step/enable', { code: totpAt(key, Date.now()) }, { cookie: two })).status).toBe(200)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ key, confirmed: true })

      // Each site keeps its own copy: switching one off leaves the other on.
      const stillIn = sessionCookie(await post(first, '/api/auth/login', { ...ADMIN, code: totpAt(key, Date.now() + 30_000) }))!
      expect((await post(first, '/api/admin/two-step/disable', { password: ADMIN.password }, { cookie: stillIn })).status).toBe(200)
      expect((await post(second, '/api/auth/login', ADMIN)).status).toBe(401)
    }
    finally {
      await first.stop()
      await second.stop()
    }
  })

  it('takes the key from TWO_STEP_KEY when that is set, as a Docker install would', async () => {
    const given = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const server = await startServer({ env: { TWO_STEP_KEY: given } })
    try {
      const cookie = await completeSetup(server)
      const begun = await (await post(server, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie })).json() as Details
      expect(plain(begun.key)).toBe(given)
      expect(begun.known).toBe(true)
      expect((await post(server, '/api/admin/two-step/enable', { code: totpAt(given, Date.now()) }, { cookie })).status).toBe(200)
    }
    finally {
      await server.stop()
    }
  })
})

describe('fotobogen two-step, on the server', () => {
  const cli = (dataDir: string, args: string[], env: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', 'two-step', ...args], { env: { ...baseEnv(), DATA_DIR: dataDir, FOTOBOGEN_IN_DOCKER: '1', ...env }, encoding: 'utf8' })
    return { code: result.status, out: result.stdout + result.stderr }
  }

  it('lets an owner back in who has lost the phone and the backup codes, and shows the key for a new phone', async () => {
    const server = await startServer()
    try {
      const cookie = await completeSetup(server)
      expect(cli(server.dataDir, ['key']).out).toMatch(/no two-step login key yet/)
      expect(cli(server.dataDir, ['off']).out).toMatch(/already off/)
      expect(cli(server.dataDir, []).code).toBe(1)

      const key = plain((await (await post(server, '/api/admin/two-step/begin', { password: ADMIN.password }, { cookie })).json() as Details).key)
      const enabled = await post(server, '/api/admin/two-step/enable', { code: totpAt(key, Date.now()) }, { cookie })
      const session = sessionCookie(enabled)!
      expect((await post(server, '/api/auth/login', ADMIN)).status).toBe(401)

      const shown = cli(server.dataDir, ['key'])
      expect(shown.code).toBe(0)
      expect(plain(shown.out)).toContain(key)

      expect(cli(server.dataDir, ['off', '--username', 'nobody']).out).toContain('No user named "nobody"')
      const off = cli(server.dataDir, ['off'])
      expect(off.code).toBe(0)
      expect(off.out).toMatch(/now off for ansel/)
      // Everyone is signed out, and the password alone logs in again.
      expect((await get(server, '/api/admin/two-step', { cookie: session })).status).toBe(401)
      expect((await post(server, '/api/auth/login', ADMIN)).status).toBe(200)
    }
    finally {
      await server.stop()
    }
  })
})
