// Starts the built server against a throwaway data directory, the way an
// installer would run it: `node .output/server/index.mjs`.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface TestServer {
  url: string
  /** The Host header value browsers would send, e.g. localhost:4312. */
  host: string
  dataDir: string
  /** Everything the server has printed so far. */
  output(): string
  /** The setup token parsed from the output, or undefined once setup is done. */
  token(): string | undefined
  stop(): Promise<void>
  restart(): Promise<void>
  /** Resolves with the exit code if the process ends by itself. */
  exited: Promise<number | null>
}

/**
 * A minimal environment for child processes, so tests do not inherit
 * settings such as DATA_DIR or TRUST_PROXY. Windows needs a few system
 * variables for Node to start at all.
 */
export function baseEnv(): Record<string, string | undefined> {
  const keep = ['PATH', 'HOME', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'ComSpec']
  return Object.fromEntries(keep.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolvePort(port))
    })
  })
}

export async function startServer(options: { env?: Record<string, string>, dataDir?: string, waitForHealth?: boolean } = {}): Promise<TestServer> {
  const dataDir = options.dataDir ?? join(mkdtempSync(join(tmpdir(), 'fotobogen-test-')), 'data')
  const port = await freePort()
  const url = `http://localhost:${port}`
  let child: ChildProcess
  let printed = ''
  let exited: Promise<number | null>

  async function launch() {
    printed = ''
    child = spawn(process.execPath, [resolve('.output/server/index.mjs')], {
      // SAMPLES_BASE_URL points nowhere by default, so no test reaches the real Lorem Picsum.
      env: { ...baseEnv(), DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', SAMPLES_BASE_URL: 'http://127.0.0.1:9', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', chunk => { printed += chunk })
    child.stderr!.on('data', chunk => { printed += chunk })
    exited = new Promise(done => child.once('exit', code => done(code)))
    if (options.waitForHealth === false) return
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (response.ok) return
      }
      catch { /* not listening yet */ }
      if (child.exitCode !== null) throw new Error(`Server exited early:\n${printed}`)
      await new Promise(wait => setTimeout(wait, 50))
    }
    throw new Error(`Server did not become healthy:\n${printed}`)
  }

  async function stop() {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await exited
  }

  await launch()

  return {
    url,
    host: `localhost:${port}`,
    dataDir,
    output: () => printed,
    token: () => printed.match(/setup token: ([0-9a-f]{32})/)?.[1],
    stop,
    restart: async () => { await stop(); await launch() },
    get exited() { return exited },
  }
}

/** POST JSON the way the site's own pages do, with a same-site Origin. */
export function post(server: TestServer, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(server.url + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: server.url, ...headers },
    body: JSON.stringify(body),
  })
}

export function get(server: TestServer, path: string, headers: Record<string, string> = {}) {
  return fetch(server.url + path, { redirect: 'manual', headers })
}

/** The `name=value` part of the session cookie from a response, for sending back. */
export function sessionCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find(cookie => cookie.startsWith('fotobogen='))?.split(';')[0]
}
