import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

interface Status { current: string, latest: string | null, url: string | null, newer: boolean, checkedAt: number | null, problem: string | null, automatic: boolean }

describe('checking for updates', () => {
  let github: Server
  let answer: { status: number, body: unknown } = { status: 200, body: {} }
  const asked: string[] = []
  let server: TestServer
  let cookie: string
  const check = async (body: unknown = {}) => await (await fetch(server.url + '/api/admin/updates', {
    method: 'POST', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })).json() as Status
  const known = async () => await (await get(server, '/api/admin/updates', { cookie })).json() as Status

  beforeAll(async () => {
    // A stand-in for GitHub's releases API.
    github = createServer((request, response) => {
      asked.push(`${request.headers['user-agent']} ${Object.keys(request.headers).includes('cookie') ? 'with-cookie' : 'no-cookie'}`)
      response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body))
    })
    await new Promise<void>(listening => github.listen(0, '127.0.0.1', listening))
    server = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest` } })
    cookie = await completeSetup(server)
  })
  afterAll(async () => {
    await server.stop()
    await new Promise(closed => github.close(closed))
  })

  it('never asks GitHub by itself: only an admin pressing the button does', async () => {
    expect(await known()).toMatchObject({ latest: null, newer: false, checkedAt: null, automatic: false })
    await get(server, '/api/admin/overview', { cookie })
    await new Promise(wait => setTimeout(wait, 300))
    expect(asked).toEqual([])
    expect((await get(server, '/api/admin/updates')).status).toBe(401)
    const anonymous = await fetch(server.url + '/api/admin/updates', { method: 'POST', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{}' })
    expect(anonymous.status).toBe(401)
    expect(asked).toEqual([])
  })

  it('reports a newer release, with a link to it, and sends nothing about the site', async () => {
    answer = { status: 200, body: { tag_name: 'v9.2.0', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0' } }
    const status = await check()
    expect(status).toMatchObject({ latest: '9.2.0', newer: true, problem: null, url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0' })
    expect(status.checkedAt).toBeGreaterThan(Date.now() - 60_000)
    expect(asked).toEqual(['fotobogen-update-check no-cookie'])
    expect(await known()).toMatchObject({ latest: '9.2.0', newer: true }) // remembered without asking again
    expect(asked).toHaveLength(1)
  })

  it('says so when this is already the latest, or when an older one is', async () => {
    const { current } = await known()
    answer = { status: 200, body: { tag_name: `v${current}`, html_url: 'https://github.com/cschweda/fotobogen/releases' } }
    expect(await check()).toMatchObject({ latest: current, newer: false, problem: null })
    answer = { status: 200, body: { tag_name: 'v0.0.1' } }
    expect(await check()).toMatchObject({ latest: '0.0.1', newer: false })
  })

  it('never links anywhere but the project\'s own releases, and ignores pre-releases', async () => {
    answer = { status: 200, body: { tag_name: 'v9.9.9', html_url: 'https://evil.example/install.sh' } }
    expect(await check()).toMatchObject({ newer: true, url: 'https://github.com/cschweda/fotobogen/releases' })
    answer = { status: 200, body: { tag_name: 'v10.0.0-rc.1' } }
    expect(await check()).toMatchObject({ latest: null, newer: false, problem: 'The latest release has a version this copy does not recognise.' })
  })

  it('explains, without failing, when there is no release or GitHub cannot be reached', async () => {
    answer = { status: 404, body: { message: 'Not Found' } }
    expect(await check()).toMatchObject({ newer: false, problem: 'No release of Fotobogen has been published yet.' })
    answer = { status: 503, body: {} }
    expect((await check()).problem).toContain('it answered 503')
    const offline = await startServer() // its UPDATES_URL points nowhere
    try {
      const offlineCookie = await completeSetup(offline)
      const response = await fetch(offline.url + '/api/admin/updates', { method: 'POST', headers: { origin: offline.url, cookie: offlineCookie, 'content-type': 'application/json' }, body: '{}' })
      expect(await response.json()).toMatchObject({ newer: false, problem: 'GitHub could not be reached from this server.' })
    }
    finally {
      await offline.stop()
    }
  })

  it('checks once a day by itself only when that is switched on', async () => {
    answer = { status: 200, body: { tag_name: 'v9.2.0' } }
    expect(await check({ automatic: true })).toMatchObject({ automatic: true })
    const before = asked.length
    await known() // checked moments ago: not again
    await new Promise(wait => setTimeout(wait, 300))
    expect(asked).toHaveLength(before)
    // Pretend the last check was two days ago.
    const stored = JSON.parse(query<{ value: string }>(server, `select value from settings where key = 'updates.last'`)[0]!.value) as { checkedAt: number }
    const Database = (await import('better-sqlite3')).default
    const { join } = await import('node:path')
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.prepare(`update settings set value = ? where key = 'updates.last'`).run(JSON.stringify({ ...stored, checkedAt: Date.now() - 2 * 86_400_000 }))
    db.close()
    await known()
    await expect.poll(() => asked.length, { timeout: 5_000 }).toBe(before + 1)
    expect(await check({ automatic: false })).toMatchObject({ automatic: false })
  })
})

interface Announced extends Status { decided: boolean }

describe('telling the owner about an update', () => {
  let github: Server
  let release: unknown = { tag_name: 'v9.2.0', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0' }
  let asked = 0
  let server: TestServer
  let cookie: string
  const send = async (body: unknown) => await fetch(server.url + '/api/admin/updates', {
    method: 'POST', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const known = async () => await (await get(server, '/api/admin/updates', { cookie })).json() as Announced

  beforeAll(async () => {
    github = createServer((_request, response) => {
      asked++
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(release))
    })
    await new Promise<void>(listening => github.listen(0, '127.0.0.1', listening))
    server = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest` } })
    cookie = await completeSetup(server)
  })
  afterAll(async () => {
    await server.stop()
    await new Promise(closed => github.close(closed))
  })

  it('knows the owner has not yet said whether it may check, and asks nobody until they do', async () => {
    expect(await known()).toMatchObject({ decided: false, automatic: false, newer: false })
    expect(asked).toBe(0)
  })

  it('remembers a "no" as an answer, and still asks nobody', async () => {
    expect(await (await send({ automatic: false })).json()).toMatchObject({ decided: true, automatic: false, newer: false })
    expect(asked).toBe(0)
  })

  it('checks straight away when the owner says yes, and reports what it finds', async () => {
    expect(await (await send({ automatic: true })).json()).toMatchObject({ decided: true, automatic: true, latest: '9.2.0', newer: true })
    expect(asked).toBe(1)
    // Saying yes again a moment later does not ask GitHub again.
    await send({ automatic: true })
    expect(asked).toBe(1)
  })

  it('forgets, at every login, that the note about a new version was closed', async () => {
    // Closing the note is kept in the browser, in a cookie that lasts until the browser is closed. Logging in clears it.
    const login = await fetch(server.url + '/api/auth/login', { method: 'POST', headers: { origin: server.url, 'content-type': 'application/json', 'cookie': 'fb-update-note=9.2.0' }, body: JSON.stringify(ADMIN) })
    expect(login.status).toBe(200)
    const cleared = login.headers.getSetCookie().find(value => value.startsWith('fb-update-note='))
    expect(cleared).toMatch(/^fb-update-note=;/)
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/)
  })

  it('lets a demo visitor see the announcement but not answer for the owner', async () => {
    const demo = await startServer({ env: { DEMO_MODE: '1' } })
    try {
      await completeSetup(demo)
      const login = await fetch(demo.url + '/api/auth/login', { method: 'POST', headers: { origin: demo.url, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo', password: 'demo' }) })
      const demoCookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      expect((await get(demo, '/api/admin/updates', { cookie: demoCookie })).status).toBe(200)
      for (const body of [{ automatic: true }, { automatic: false }]) {
        const refused = await fetch(demo.url + '/api/admin/updates', { method: 'POST', headers: { origin: demo.url, cookie: demoCookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
        expect(refused.status).toBe(403)
      }
    }
    finally {
      await demo.stop()
    }
  })
})
