// Knows which copies of Fotobogen are running on this machine, so a second
// one can be started beside the first (on another port) or in its place.
// Each running copy leaves a small file in ~/.fotobogen/instances/.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Instance {
  pid: number
  port: number
  dataDir: string
  startedAt: number
}

const registryDir = (home = homedir()) => join(home, '.fotobogen', 'instances')

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 only asks whether the process exists
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM' // exists, but belongs to someone else
  }
}

/** The copies of Fotobogen running now. Leftovers from copies that have stopped are cleared away. */
export function runningInstances(home?: string): Instance[] {
  const dir = registryDir(home)
  let files: string[]
  try {
    files = readdirSync(dir).filter(name => name.endsWith('.json'))
  }
  catch {
    return []
  }
  const running: Instance[] = []
  for (const file of files) {
    try {
      const instance = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Instance
      if (Number.isInteger(instance.pid) && instance.pid !== process.pid && isAlive(instance.pid)) running.push(instance)
      else if (instance.pid !== process.pid) rmSync(join(dir, file), { force: true })
    }
    catch {
      rmSync(join(dir, file), { force: true })
    }
  }
  return running.sort((a, b) => a.startedAt - b.startedAt)
}

/** Records this process as running. Returns a function that removes the record. Never throws. */
export function registerInstance(instance: Omit<Instance, 'pid' | 'startedAt'>, home?: string): () => void {
  const file = join(registryDir(home), `${process.pid}.json`)
  try {
    mkdirSync(registryDir(home), { recursive: true })
    writeFileSync(file, JSON.stringify({ ...instance, dataDir: resolve(instance.dataDir), pid: process.pid, startedAt: Date.now() }))
  }
  catch { /* a home directory that cannot be written (some containers) only costs this feature */ }
  return () => {
    try {
      rmSync(file, { force: true })
    }
    catch { /* nothing to remove */ }
  }
}

/** Asks a running copy to stop and waits for it to go. False if it is still there after ten seconds. */
export async function stopInstance(instance: Instance): Promise<boolean> {
  try {
    process.kill(instance.pid)
  }
  catch { /* already gone */ }
  for (let waited = 0; waited < 10_000; waited += 100) {
    if (!isAlive(instance.pid)) return true
    await new Promise(wait => setTimeout(wait, 100))
  }
  return false
}

export function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((free) => {
    const probe = createServer()
    probe.once('error', () => free(false))
    probe.listen(port, host, () => probe.close(() => free(true)))
  })
}

export type PortChoice
  = | { port: number, moved: boolean }
    | { error: string }

/**
 * The port to listen on. A port the owner chose is used exactly or refused.
 * The default moves up to the next free port when it is taken.
 */
export async function choosePort(wanted: number, explicit: boolean, host: string, attempts: number, free = isPortFree): Promise<PortChoice> {
  if (explicit) {
    return await free(wanted, host)
      ? { port: wanted, moved: false }
      : { error: `Port ${wanted} is already in use. Choose another PORT in .env, or stop whatever is using it.` }
  }
  for (let port = wanted; port < wanted + attempts; port++) {
    if (await free(port, host)) return { port, moved: port !== wanted }
  }
  return { error: `Ports ${wanted} to ${wanted + attempts - 1} are all in use. Set PORT in .env to a free port.` }
}

export type Plan
  = | { action: 'start' }
    | { action: 'ask', sameData: Instance[], others: Instance[] }
    | { action: 'refuse', message: string }

/**
 * What to do about copies that are already running. Two copies must never
 * share a data directory: each would empty the other's uploads in progress
 * and both would work the same queue.
 */
export function planStart(running: Instance[], dataDir: string, interactive: boolean): Plan {
  if (running.length === 0) return { action: 'start' }
  const mine = resolve(dataDir)
  const sameData = running.filter(instance => resolve(instance.dataDir) === mine)
  const others = running.filter(instance => resolve(instance.dataDir) !== mine)
  if (interactive) return { action: 'ask', sameData, others }
  if (sameData.length > 0) {
    const other = sameData[0]!
    return {
      action: 'refuse',
      message: `Fotobogen is already running with this data directory (${mine}), on port ${other.port}, process ${other.pid}. Stop that copy first, or give this one its own DATA_DIR.`,
    }
  }
  return { action: 'start' } // a different site: run beside it, on another port
}
