import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseEnv } from '../helpers/server.ts'

interface Launched { child: ChildProcess, output: () => string, exited: Promise<number | null> }
const started: ChildProcess[] = []
const blockers: Server[] = []
afterEach(async () => {
  for (const child of started.splice(0)) child.kill()
  for (const server of blockers.splice(0)) await new Promise(closed => server.close(closed))
})

/** Runs `node scripts/start.mjs` the way `pnpm start` does, with its own home and working directory. */
function launch(options: { home: string, cwd?: string, dataDir: string, env?: Record<string, string> }): Launched {
  const child = spawn(process.execPath, [join(process.cwd(), 'scripts/start.mjs')], {
    cwd: options.cwd ?? process.cwd(),
    // HOME and USERPROFILE: where the record of running copies is kept.
    env: { ...baseEnv(), HOME: options.home, USERPROFILE: options.home, DATA_DIR: options.dataDir, HOST: '127.0.0.1', SAMPLES_BASE_URL: 'http://127.0.0.1:9', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  started.push(child)
  let printed = ''
  child.stdout!.on('data', chunk => { printed += chunk })
  child.stderr!.on('data', chunk => { printed += chunk })
  return { child, output: () => printed, exited: new Promise(done => child.once('exit', code => done(code))) }
}

async function runningPort(launched: Launched): Promise<number> {
  for (let tries = 0; tries < 300; tries++) {
    const match = launched.output().match(/Fotobogen is running at http:\/\/localhost:(\d+)/)
    if (match) return Number(match[1])
    if (launched.child.exitCode !== null) break
    await new Promise(wait => setTimeout(wait, 100))
  }
  throw new Error(`The launcher did not start the server:\n${launched.output()}`)
}
const temp = (name: string) => mkdtempSync(join(tmpdir(), `fb-${name}-`))

describe('pnpm start', () => {
  it('checks the machine, then starts on port 5150 or the next free port, and says which', async () => {
    const first = launch({ home: temp('home'), dataDir: join(temp('data'), 'data') })
    const port = await runningPort(first)
    expect(port).toBeGreaterThanOrEqual(5150)
    expect(port).toBeLessThan(5160)
    // First run: the whole preflight report is shown.
    expect(first.output()).toContain('Fotobogen preflight check')
    expect(first.output()).toMatch(/ok {3}Node\.js: version \d+/)
    // The token is printed as the server finishes starting, a moment after its address.
    await vi.waitFor(() => expect(first.output()).toContain('Fotobogen setup token:'), { timeout: 10_000 })
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json() as { status: string }
    expect(health.status).toBe('ok')
  })

  it('runs a second site beside the first on the next port up', async () => {
    const home = temp('home')
    const first = launch({ home, dataDir: join(temp('data'), 'data') })
    const firstPort = await runningPort(first)
    const second = launch({ home, dataDir: join(temp('data'), 'data') })
    const secondPort = await runningPort(second)
    expect(secondPort).toBeGreaterThan(firstPort)
    expect(second.output()).toMatch(/Port 5150 is in use, so Fotobogen is using port \d+\./)
  })

  it('refuses to start a second copy on the same data directory', async () => {
    const home = temp('home')
    const dataDir = join(temp('data'), 'data')
    const first = launch({ home, dataDir })
    const port = await runningPort(first)
    const second = launch({ home, dataDir })
    expect(await second.exited).toBe(1)
    expect(second.output()).toContain('Fotobogen is already running with this data directory')
    expect(second.output()).toContain(`port ${port}`)
    // The first copy is unharmed.
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200)
  })

  it('uses a port set in .env exactly, and stops if it is taken', async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>(listening => blocker.listen(0, '127.0.0.1', listening))
    const taken = (blocker.address() as { port: number }).port
    const cwd = temp('cwd')
    writeFileSync(join(cwd, '.env'), `PORT=${taken}\n`)
    const launched = launch({ home: temp('home'), cwd, dataDir: join(temp('data'), 'data') })
    expect(await launched.exited).toBe(1)
    expect(launched.output()).toContain(`Port ${taken} is already in use.`)

    await new Promise(closed => blocker.close(closed))
    blockers.pop()
    const again = launch({ home: temp('home'), cwd, dataDir: join(temp('data'), 'data') })
    expect(await runningPort(again)).toBe(taken)
  })

  it('stops before starting when the preflight check fails, and says what to fix', async () => {
    const file = join(temp('data'), 'a-file')
    writeFileSync(file, 'not a directory')
    const launched = launch({ home: temp('home'), dataDir: join(file, 'data') })
    expect(await launched.exited).toBe(1)
    expect(launched.output()).toContain(' FAIL  Data directory:')
    expect(launched.output()).toContain('set DATA_DIR in .env')
    expect(launched.output()).toContain('Fotobogen did not start.')
    expect(launched.output()).not.toContain('Fotobogen is running')
  })
})
