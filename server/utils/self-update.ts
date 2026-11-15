// The admin's side of updating Fotobogen from inside itself: whether this
// copy can, what the last attempt did, and starting one.
//
// The work is done by scripts/update.mjs in a process of its own, detached
// from the server, so it carries on while the server is busy or restarted.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { useRuntimeConfig } from 'nuxt/server'
import { markUpdateStarted, readUpdateState, updateInProgress, updateSupport, type UpdateState, type UpdateSupport } from '../core/updater.ts'
import { getPaths } from './app.ts'
import { updateStatus } from './updates.ts'

/** The folder Fotobogen is installed in: where it was started from, if that is its own folder. */
function installRoot(): string | null {
  const root = process.cwd()
  return existsSync(join(root, 'scripts', 'update.mjs')) && existsSync(join(root, 'package.json')) ? root : null
}

let support: Promise<UpdateSupport> | undefined
/** Worked out once: it asks git and pnpm for their versions, and none of it changes while the server runs. */
export function selfUpdateSupport(): Promise<UpdateSupport> {
  const root = installRoot()
  support ??= root
    ? updateSupport(root, process.env)
    : Promise.resolve({ method: 'none' as const, restart: 'manual' as const, reason: 'Fotobogen was not started from its own folder, so it cannot find itself to update.' })
  return support
}

export interface SelfUpdate {
  support: UpdateSupport
  current: string
  /** The newer release, when the last check found one. */
  available: string | null
  releaseUrl: string | null
  state: UpdateState
  /** True while an update is being installed. */
  running: boolean
  /** True when a version has been built and is waiting for Fotobogen to be restarted. */
  waitingForRestart: boolean
}

export async function selfUpdate(): Promise<SelfUpdate> {
  const current = String(useRuntimeConfig().appVersion)
  const check = updateStatus()
  const state = readUpdateState(getPaths().root)
  const running = updateInProgress(state)
  // A "running" state with nobody doing the work means it was cut off: the server was rebooted, say.
  const cutOff = state.state === 'running' && !running
  return {
    support: await selfUpdateSupport(),
    current,
    available: check.newer ? check.latest : null,
    releaseUrl: check.url,
    state: cutOff ? { ...state, state: 'failed', error: 'The update was interrupted before it finished. Check the site, then try again.' } : state,
    running,
    // Built, but this server is still the old version: it has not been restarted yet.
    waitingForRestart: state.state === 'done' && state.version !== null && state.version !== current,
  }
}

/** Starts installing the release the last check found. Returns why not, if it cannot. */
export async function startSelfUpdate(): Promise<{ started: true } | { started: false, reason: string }> {
  const status = await selfUpdate()
  if (status.support.method !== 'source') return { started: false, reason: status.support.reason ?? 'This copy cannot update itself.' }
  if (status.running) return { started: false, reason: 'An update is already being installed.' }
  if (status.waitingForRestart) return { started: false, reason: `Version ${status.state.version} is already installed and waiting for Fotobogen to be restarted.` }
  // Only ever the version the check found: never one named by whoever is asking.
  if (!status.available) return { started: false, reason: 'There is no newer version to install. Check for updates first.' }

  const root = installRoot()!
  const args = [join(root, 'scripts', 'update.mjs'), status.available, '--server-pid', String(process.pid)]
  // Under pm2 the server is started again by itself, so the update can stop it when the new version is ready.
  if (status.support.restart === 'automatic') args.push('--restart')
  const child = spawn(process.execPath, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: true })
  // If it could not even be started, say so now, not after the page has waited.
  if (!child.pid) return { started: false, reason: 'The update could not be started on this server.' }
  // Say it is under way at once: the process doing it takes a moment to say so itself.
  markUpdateStarted(getPaths().root, { version: status.available, from: status.current, pid: child.pid })
  child.unref()
  return { started: true }
}
