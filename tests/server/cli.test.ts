import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseEnv, get, post, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

function cli(dataDir: string, args: string[], input = '') {
  const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', ...args], {
    env: { ...baseEnv(), DATA_DIR: dataDir },
    input,
    encoding: 'utf8',
  })
  return { code: result.status, out: result.stdout + result.stderr }
}

const login = (server: TestServer, password: string) =>
  post(server, '/api/auth/login', { username: ADMIN.username, password })

describe('fotobogen reset-admin', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('refuses a password shorter than 12 characters and changes nothing', async () => {
    const result = cli(server.dataDir, ['reset-admin'], 'elevenchars\n')
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/at least 12 characters/)
    expect((await login(server, ADMIN.password)).status).toBe(200)
  })

  it('fails clearly for a username that does not exist', () => {
    const result = cli(server.dataDir, ['reset-admin', '--username', 'nobody'], 'a brand new password\n')
    expect(result.code).toBe(1)
    expect(result.out).toContain('No user named "nobody"')
  })

  it('sets the new password while the server is running', async () => {
    const result = cli(server.dataDir, ['reset-admin'], 'a brand new password\n')
    expect(result.out).toContain(`Password updated for ${ADMIN.username}. All sessions were signed out.`)
    expect(result.code).toBe(0)
    expect((await login(server, ADMIN.password)).status).toBe(401)
    expect((await login(server, 'a brand new password')).status).toBe(200)
  })

  it('signs out sessions that existed before the reset', async () => {
    expect((await get(server, '/api/admin/overview', { cookie })).status).toBe(401)
    expect(query(server, 'select session_version from users')).toEqual([{ session_version: 2 }])
  })

  it('never prints the password', () => {
    const result = cli(server.dataDir, ['reset-admin'], 'another secret password\n')
    expect(result.out).not.toContain('another secret password')
  })
})

describe('fotobogen CLI', () => {
  it('prints usage when given no command', () => {
    const result = cli('/nonexistent', [])
    expect(result.out).toContain('Usage: fotobogen <command>')
    expect(result.out).toContain('reset-admin')
    expect(result.code).toBe(1)
  })

  it('prints usage for --help and exits 0', () => {
    expect(cli('/nonexistent', ['--help']).code).toBe(0)
  })

  it('explains that there is nothing to reset before setup', async () => {
    const server = await startServer()
    try {
      const result = cli(server.dataDir, ['reset-admin'], 'a brand new password\n')
      expect(result.code).toBe(1)
      expect(result.out).toMatch(/no admin account yet/i)
    }
    finally { await server.stop() }
  })

  it('explains a missing database instead of creating one', () => {
    const result = cli('/nonexistent-fotobogen-data', ['reset-admin'], 'a brand new password\n')
    expect(result.code).toBe(1)
    expect(result.out).toContain('No Fotobogen database found at /nonexistent-fotobogen-data/fotobogen.db')
  })
})
