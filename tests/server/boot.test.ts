import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, startServer, type TestServer } from '../helpers/server.ts'

describe('first boot', () => {
  let server: TestServer
  beforeAll(async () => { server = await startServer() })
  afterAll(() => server.stop())

  it('creates the data directory, database, secret, and subdirectories', () => {
    for (const name of ['fotobogen.db', 'secret', 'setup-token', 'originals', 'derivatives', 'skins', 'modules']) {
      expect(existsSync(join(server.dataDir, name)), name).toBe(true)
    }
  })

  it('opens the database in WAL mode', () => {
    expect(existsSync(join(server.dataDir, 'fotobogen.db-wal'))).toBe(true)
  })

  it('prints the setup token that is stored in the data directory', () => {
    expect(server.token()).toBe(readFileSync(join(server.dataDir, 'setup-token'), 'utf8').trim())
    expect(server.output()).toContain('Fotobogen setup token: ')
  })

  it.skipIf(process.platform === 'win32')('keeps the secret and token private to the owner', () => {
    expect(statSync(join(server.dataDir, 'secret')).mode & 0o777).toBe(0o600)
    expect(statSync(join(server.dataDir, 'setup-token')).mode & 0o777).toBe(0o600)
  })

  it('reports version, database status, and queue depth at /api/health', async () => {
    const response = await get(server, '/api/health')
    expect(response.status).toBe(200)
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(await response.json()).toEqual({ version: pkg.version, database: 'ok', queue: { depth: 0 } })
  })

  it('keeps the same token and secret across a restart', async () => {
    const token = server.token()
    const secret = readFileSync(join(server.dataDir, 'secret'), 'utf8')
    await server.restart()
    expect(server.token()).toBe(token)
    expect(readFileSync(join(server.dataDir, 'secret'), 'utf8')).toBe(secret)
  })
})

describe('boot failures', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('exits with one clear line when the data directory is not writable', async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'fotobogen-test-')), 'data')
    mkdirSync(dataDir)
    chmodSync(dataDir, 0o500)
    const server = await startServer({ dataDir, waitForHealth: false })
    expect(await server.exited).toBe(1)
    expect(server.output()).toContain('Fotobogen could not start: Fotobogen cannot write to its data directory: ' + dataDir)
    expect(server.output()).not.toMatch(/\n\s+at /) // no stack trace
    chmodSync(dataDir, 0o700)
  })

  it('refuses to start with a damaged secret rather than replacing it', async () => {
    const first = await startServer()
    await first.stop()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(first.dataDir, 'secret'), 'short')
    const second = await startServer({ dataDir: first.dataDir, waitForHealth: false })
    expect(await second.exited).toBe(1)
    expect(second.output()).toContain('Fotobogen could not start: The session secret file')
    expect(readFileSync(join(first.dataDir, 'secret'), 'utf8')).toBe('short')
  })
})
