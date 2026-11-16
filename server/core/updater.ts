// Updating Fotobogen from inside itself, for a copy installed from source
// with git: fetch a released version, switch to it, install its packages,
// and build it. If any step fails, go back to the version that was running.
//
// Plain TypeScript with nothing from the web framework, so the same code
// runs from the admin (through scripts/update.mjs) and from the command
// line (`pnpm fotobogen update`), and can be tested against real git
// repositories.
//
// Every command run is fixed here. Nothing typed into a web page reaches a
// command line: the only outside value is the version, which must be three
// numbers and must exist as a tag in the copy's own "origin".
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isNewer, parseVersion } from './version.ts'

export interface ExecResult { code: number, output: string }
export type Exec = (command: string, args: string[], options: { cwd: string, timeoutMs?: number }) => Promise<ExecResult>

/** Runs a command and collects what it prints. Never throws: a command that cannot be started answers with code 127. */
export const realExec: Exec = (command, args, { cwd, timeoutMs = 20 * 60_000 }) => new Promise((resolve) => {
  let output = ''
  // Arguments are always passed as a list, never built into a command line.
  // The one exception is pnpm on Windows, which is a .cmd file that only a
  // shell can start; pnpm is only ever given the fixed words written in this
  // file, so nothing from outside can reach that shell.
  const needsShell = process.platform === 'win32' && command === 'pnpm'
  const child = spawn(command, args, { cwd, shell: needsShell, windowsHide: true, env: { ...process.env, CI: '1' } })
  const timer = setTimeout(() => { output += `\n(stopped after ${Math.round(timeoutMs / 60_000)} minutes)`; child.kill() }, timeoutMs)
  const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-20_000) }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.on('error', (error) => { clearTimeout(timer); resolve({ code: 127, output: `${output}${error.message}` }) })
  child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, output }) })
})

export interface UpdateSupport {
  /** How this copy was installed, as far as updating goes. */
  method: 'source' | 'docker' | 'none'
  /** Whether something will start Fotobogen again by itself after it stops (pm2 does). */
  restart: 'automatic' | 'manual'
  /** Why it cannot update itself, when it cannot. */
  reason: string | null
}

/** Whether this copy can update itself, and how it would come back afterwards. */
export async function updateSupport(root: string, env: Record<string, string | undefined>, exec: Exec = realExec, exists: (path: string) => boolean = existsSync): Promise<UpdateSupport> {
  const restart = env.pm_id !== undefined ? 'automatic' : 'manual'
  if (env.FOTOBOGEN_IN_DOCKER === '1' || exists('/.dockerenv')) {
    return { method: 'docker', restart, reason: 'This copy runs in Docker. A container cannot replace itself, so it is updated from the server.' }
  }
  if (!exists(join(root, '.git'))) {
    return { method: 'none', restart, reason: 'This copy was not installed with git, so it cannot fetch a new version by itself.' }
  }
  for (const [tool, name] of [['git', 'git'], ['pnpm', 'pnpm']] as const) {
    if ((await exec(tool, ['--version'], { cwd: root, timeoutMs: 15_000 })).code !== 0) {
      return { method: 'none', restart, reason: `${name} was not found on this server, and updating needs it.` }
    }
  }
  return { method: 'source', restart, reason: null }
}

export interface UpdateState {
  /** idle: nothing has been tried. running: in progress. done: built, waiting for a restart. failed: it did not work, and the old version is still in place. */
  state: 'idle' | 'running' | 'done' | 'failed'
  /** The version being installed, and the one it replaces. */
  version: string | null
  from: string | null
  /** What is being done now, or was being done when it stopped. */
  step: string | null
  startedAt: number | null
  finishedAt: number | null
  /** Why it failed, in a sentence. */
  error: string | null
  /** What has happened so far, a line for each step, then the end of a failing command's output. */
  log: string[]
  /** The process doing the work, so a second update is not started beside it. */
  pid: number | null
}

export const STATUS_FILE = 'update-status.json'
const IDLE: UpdateState = { state: 'idle', version: null, from: null, step: null, startedAt: null, finishedAt: null, error: null, log: [], pid: null }

export function readUpdateState(dataDir: string): UpdateState {
  try {
    return { ...IDLE, ...JSON.parse(readFileSync(join(dataDir, STATUS_FILE), 'utf8')) as Partial<UpdateState> }
  }
  catch {
    return { ...IDLE }
  }
}

function writeState(dataDir: string, state: UpdateState): void {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, STATUS_FILE), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

/**
 * Records that an update has been started, before the process doing it has
 * had time to say so itself, so that whoever asks next is told it is under way.
 */
export function markUpdateStarted(dataDir: string, details: { version: string, from: string | null, pid: number, now?: number }): void {
  writeState(dataDir, { ...IDLE, state: 'running', version: details.version, from: details.from, step: 'Starting', startedAt: details.now ?? Date.now(), log: ['Starting'], pid: details.pid })
}

/** True while the process that was doing an update is still alive. */
export function updateInProgress(state: UpdateState): boolean {
  if (state.state !== 'running' || !state.pid) return false
  try {
    process.kill(state.pid, 0)
    return true
  }
  catch {
    return false
  }
}

class UpdateError extends Error {}

export interface UpdateOptions {
  /** The folder Fotobogen is installed in. */
  root: string
  dataDir: string
  /** The version to install: three numbers, as in "1.2.0". */
  version: string
  exec?: Exec
  /** Keeps a copy of the database before anything changes. Returns where, for the log. */
  snapshot?: () => string | null
  now?: () => number
  /** The commands that install and build, changed only by the tests. */
  install?: [string, string[]]
  build?: [string, string[]]
}

const versionAt = (root: string): string | null => {
  try {
    return String((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown }).version ?? '') || null
  }
  catch {
    return null
  }
}

/**
 * Installs a released version over the one in `root`.
 *
 * Nothing is changed until the new version has been fetched and found to be
 * a real, later release that follows on from this copy. If switching,
 * installing, or building then fails, the copy is put back as it was and
 * built again, so the site keeps working on the old version.
 */
export async function runUpdate(options: UpdateOptions): Promise<UpdateState> {
  const { root, dataDir } = options
  let { version } = options
  const exec = options.exec ?? realExec
  const now = options.now ?? Date.now
  const install = options.install ?? ['pnpm', ['install', '--frozen-lockfile']]
  const build = options.build ?? ['pnpm', ['build']]
  const from = versionAt(root)
  const state: UpdateState = { ...IDLE, state: 'running', version, from, startedAt: now(), log: [], pid: process.pid }
  const say = (step: string) => {
    state.step = step
    state.log.push(step)
    writeState(dataDir, state)
  }
  /** Runs a command; a failure ends the update with what the command said. */
  const run = async (command: string, args: string[], failure: string, timeoutMs?: number): Promise<string> => {
    const result = await exec(command, args, { cwd: root, timeoutMs })
    if (result.code !== 0) {
      const tail = result.output.trim().split('\n').slice(-12)
      state.log.push(...tail.map(line => `    ${line}`))
      throw new UpdateError(failure)
    }
    return result.output.trim()
  }
  const finish = (result: 'done' | 'failed', error: string | null = null): UpdateState => {
    state.state = result
    state.error = error
    state.finishedAt = now()
    state.pid = null
    writeState(dataDir, state)
    return state
  }

  let previous: string | null = null
  let branch: string | null = null
  let switched = false
  try {
    if (!parseVersion(version)) throw new UpdateError(`"${version}" is not a version number.`)
    // One spelling from here on: "v1.4.0" and "1.4.00" both mean 1.4.0.
    version = parseVersion(version)!.join('.')
    if (!from || !isNewer(version, from)) throw new UpdateError(`Version ${version} is not newer than the one installed (${from ?? 'unknown'}).`)
    const tag = `v${parseVersion(version)!.join('.')}`

    say('Saving a copy of the database')
    const kept = options.snapshot?.()
    if (kept) state.log.push(`    kept at ${kept}`)

    say(`Fetching version ${version}`)
    previous = await run('git', ['rev-parse', 'HEAD'], 'This folder is not a git checkout that can be read.', 30_000)
    // It is used again later, to go back; make sure it is a commit's id and nothing else.
    if (!/^[0-9a-f]{40,64}$/.test(previous)) throw new UpdateError('git gave an answer that could not be understood.')
    const onBranch = await exec('git', ['symbolic-ref', '-q', '--short', 'HEAD'], { cwd: root, timeoutMs: 30_000 })
    branch = onBranch.code === 0 ? onBranch.output.trim() : null
    await run('git', ['fetch', '--tags', 'origin'], 'The new version could not be fetched. Check that this server can reach where Fotobogen was cloned from.', 5 * 60_000)
    await run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`], `Version ${version} was not found where this copy was cloned from.`, 30_000)
    // The new version must follow on from what is here. A copy with changes of
    // its own that the release does not contain is left alone.
    if ((await exec('git', ['merge-base', '--is-ancestor', 'HEAD', tag], { cwd: root, timeoutMs: 30_000 })).code !== 0) {
      throw new UpdateError(`This copy has changes that are not part of version ${version}, so it cannot simply move to it. Update it by hand.`)
    }

    say(`Switching to version ${version}`)
    // If this fails, git has changed nothing, so there is nothing to put back.
    if (branch) await run('git', ['merge', '--ff-only', tag], 'Files changed on this server stand in the way of the new version. Undo those changes, or update by hand.', 60_000)
    else await run('git', ['checkout', '--quiet', tag], 'Files changed on this server stand in the way of the new version. Undo those changes, or update by hand.', 60_000)
    switched = true
    if (versionAt(root) !== version) throw new UpdateError(`The files fetched say they are version ${versionAt(root) ?? 'unknown'}, not ${version}.`)

    say('Installing its packages')
    await run(install[0], install[1], 'The new version\'s packages could not be installed.')

    say('Building it (the site may be slow or show errors for a minute or two)')
    await run(build[0], build[1], 'The new version could not be built. This usually means the server ran out of memory; it needs about 2 GB, counting swap.')

    say(`Version ${version} is built and ready`)
    return finish('done')
  }
  catch (error) {
    const reason = error instanceof UpdateError ? error.message : `Something unexpected happened: ${error instanceof Error ? error.message : String(error)}`
    if (!switched || !previous) return finish('failed', `${reason} Nothing was changed.`)

    // Put the old version back, and build it again so the site keeps working.
    say(`Going back to version ${from}`)
    // "--keep", not "--hard": files changed on this server (a port set in the
    // pm2 file, say) are left exactly as they are.
    const back = await exec('git', branch ? ['reset', '--keep', previous] : ['checkout', '--quiet', previous], { cwd: root, timeoutMs: 60_000 })
    const reinstalled = back.code === 0 ? await exec(install[0], install[1], { cwd: root }) : back
    const rebuilt = reinstalled.code === 0 ? await exec(build[0], build[1], { cwd: root }) : reinstalled
    if (rebuilt.code !== 0) {
      state.log.push(...rebuilt.output.trim().split('\n').slice(-12).map(line => `    ${line}`))
      return finish('failed', `${reason} Going back to version ${from} also failed, so the site may not start after a restart. On the server, run "git status" in Fotobogen's folder, then "pnpm install" and "pnpm build".`)
    }
    return finish('failed', `${reason} The site was put back to version ${from} and is unchanged.`)
  }
}
