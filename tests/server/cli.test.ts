import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseEnv, get, post, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'

function cli(dataDir: string, args: string[], input = '', env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', ...args], {
    env: { ...baseEnv(), DATA_DIR: dataDir, SAMPLES_BASE_URL: 'http://127.0.0.1:9', ...env },
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
    expect(result.out).toContain('No Fotobogen database found at ' + join('/nonexistent-fotobogen-data', 'fotobogen.db') + '')
  })
})

describe('fotobogen init', () => {
  const init = (cwd: string, input: string, env: Record<string, string | undefined> = {}) => spawnSync(process.execPath, [join(process.cwd(), 'scripts/fotobogen.mjs'), 'init'], {
    cwd, input, encoding: 'utf8', env: { ...process.env, CI: undefined, ...env },
  })

  it('needs a terminal, and says how to do it by hand without one', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'fb-init-'))
    const result = init(cwd, '')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('needs a terminal')
    expect(existsSync(join(cwd, '.env'))).toBe(false)
  })

  it('asks again and changes only its own settings in an existing .env', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'fb-init-'))
    writeFileSync(join(cwd, '.env'), '# mine\nMAX_UPLOAD_MB=80\nPORT=5150\n')
    // All three answers at once: the questions are read a line at a time.
    const result = init(cwd, '\nphotos.example.com\ny\n', { FOTOBOGEN_ASSUME_TERMINAL: '1' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Your other settings in .env are kept.')
    expect(result.stdout).toContain('Restart Fotobogen')
    expect(readFileSync(join(cwd, '.env'), 'utf8')).toBe('# mine\nMAX_UPLOAD_MB=80\n# PORT=5150\nSITE_URL=https://photos.example.com\nDEMO_MODE=1\n')
  })
})


describe('the data folder named in .env', () => {
  it('is used by the command-line tool, as it is by the server', async () => {
    const server = await startServer()
    try {
      await completeSetup(server)
      // A folder with only a .env in it, as an installed copy has, naming where the data is.
      const home = mkdtempSync(join(tmpdir(), 'fb-cli-env-'))
      writeFileSync(join(home, '.env'), `DATA_DIR=${server.dataDir}\n`)
      const env = { ...baseEnv(), HOME: home, USERPROFILE: home }
      delete env.DATA_DIR
      const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts/fotobogen.mjs'), 'backup', join(home, 'out.zip')], { cwd: home, env, encoding: 'utf8' })
      expect(result.stdout + result.stderr).not.toContain('No Fotobogen database')
      expect(result.status).toBe(0)
      expect(existsSync(join(home, 'out.zip'))).toBe(true)
    }
    finally {
      await server.stop()
    }
  })
})
