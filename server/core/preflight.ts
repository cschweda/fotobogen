// The preflight check: is this machine able to run Fotobogen properly?
// It runs before the server starts. Anything marked "fail" stops the start
// with a line saying what to fix, so an install never half-works on a
// machine that is too small or missing something.
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statfsSync } from 'node:fs'
import { arch, platform, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import { config } from './config.ts'

export interface Facts {
  nodeVersion: string
  platform: string
  arch: string
  /** From /etc/os-release on Linux: the distribution and what it is based on. */
  linux: { id: string, like: string[], name: string } | null
  /** Memory this process may use, in MB: the machine's, or the container's limit if lower. */
  memoryMb: number
  /** Swap space in MB, where it can be read (Linux). */
  swapMb: number | null
  dataDir: string
  /** Free space on the disk holding the data directory, in MB. */
  freeDiskMb: number | null
  /** Null when the data directory can be created and written, else why not. */
  dataDirProblem: string | null
  /** Null when the image library loads and reads every accepted format, else why not. */
  imageProblem: string | null
  /** Null when the database library loads, else why not. */
  databaseProblem: string | null
  /**
   * pm2, which keeps Fotobogen running on a server: running under it,
   * installed, or missing. Null or left out where it does not apply (Docker).
   */
  pm2?: 'running' | 'installed' | 'missing' | null
}

export interface Check {
  /** A note is worth knowing but is not a problem: shown with the first, full report only. */
  level: 'ok' | 'note' | 'warn' | 'fail'
  title: string
  detail: string
  /** What to do about it. Present for notes, warnings, and failures. */
  fix?: string
}

const requirements = config.internals.requirements
const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`

/** Turns the facts about a machine into a list of checks. No side effects. */
export function evaluate(facts: Facts): Check[] {
  const checks: Check[] = []
  const add = (level: Check['level'], title: string, detail: string, fix?: string) => checks.push({ level, title, detail, fix })

  const major = Number(facts.nodeVersion.split('.')[0])
  if (major >= requirements.nodeMajor) add('ok', 'Node.js', `version ${facts.nodeVersion}`)
  else add('fail', 'Node.js', `version ${facts.nodeVersion} is too old`, `Install Node ${requirements.nodeMajor} or later (https://nodejs.org); with nvm, run "nvm use ${requirements.nodeMajor}" in this terminal. Then install again from the start, because what was installed under the old Node will not work under the new one: delete the node_modules folder, then pnpm install, pnpm build, pnpm start. (With nvm, install pnpm for the new Node first: npm install -g pnpm@10.)`)

  const names: Record<string, string> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }
  if (!requirements.platforms.includes(facts.platform)) {
    add('warn', 'Operating system', `${facts.platform} is not a tested platform`, 'Fotobogen is tested on Ubuntu and Debian Linux, macOS, and Windows. It may work here, but nobody has checked.')
  }
  else if (facts.platform === 'linux' && facts.linux && ![facts.linux.id, ...facts.linux.like].some(family => requirements.linuxFamilies.includes(family))) {
    add('warn', 'Operating system', `${facts.linux.name} is not a tested Linux`, 'Fotobogen is tested on Ubuntu and Debian. Other distributions may work; if something fails, try it on Ubuntu before reporting a bug.')
  }
  else {
    add('ok', 'Operating system', facts.linux?.name ?? names[facts.platform] ?? facts.platform)
  }

  if (requirements.architectures.includes(facts.arch)) add('ok', 'Processor', facts.arch)
  else add('fail', 'Processor', `${facts.arch} is not supported`, 'The image and database libraries are only available for 64-bit Intel/AMD (x64) and ARM (arm64) processors.')

  const { memoryMb } = facts
  if (memoryMb < requirements.memoryMb.fail) {
    add('fail', 'Memory', `${gb(memoryMb)} available`, 'Fotobogen needs at least 1 GB of memory to resize photographs. Use a larger server, or raise the container\'s memory limit.')
  }
  else if (memoryMb < requirements.memoryMb.warn && facts.swapMb !== null && facts.swapMb < 512) {
    add('warn', 'Memory', `${gb(memoryMb)} available and no swap space`, 'This is enough to run, but leaves little room for large photos. Add 2 GB of swap (on Ubuntu: fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile).')
  }
  else {
    add('ok', 'Memory', `${gb(memoryMb)} available`)
  }

  if (facts.dataDirProblem) {
    add('fail', 'Data directory', `${facts.dataDir} cannot be used: ${facts.dataDirProblem}`, 'Create that directory and make it writable by the user running Fotobogen, or set DATA_DIR in .env to a directory that is.')
  }
  else {
    add('ok', 'Data directory', facts.dataDir)
    if (facts.freeDiskMb !== null && facts.freeDiskMb < requirements.freeDiskMb.fail) {
      add('fail', 'Disk space', `${Math.round(facts.freeDiskMb)} MB free`, 'Fotobogen needs at least 500 MB free where its data is kept. Free some space, or set DATA_DIR in .env to a larger disk.')
    }
    else if (facts.freeDiskMb !== null && facts.freeDiskMb < requirements.freeDiskMb.warn) {
      add('warn', 'Disk space', `${gb(facts.freeDiskMb)} free`, 'Each photo takes its own size plus about a megabyte of resized copies. This disk will fill quickly.')
    }
    else if (facts.freeDiskMb !== null) {
      add('ok', 'Disk space', `${gb(facts.freeDiskMb)} free`)
    }
  }

  if (facts.imageProblem) add('fail', 'Image library', facts.imageProblem, 'Run `pnpm install` again in the Fotobogen folder. If that does not help, delete the node_modules folder and install once more.')
  else add('ok', 'Image library', 'reads JPEG, PNG, WebP, TIFF, and AVIF')

  if (facts.databaseProblem) add('fail', 'Database library', facts.databaseProblem, 'Run `pnpm install` again in the Fotobogen folder. If that does not help, delete the node_modules folder and install once more.')
  else add('ok', 'Database library', 'loads')

  // Optional, so never a warning: a site on your own computer does not need it.
  if (facts.pm2 === 'running') add('ok', 'pm2', 'Fotobogen is running under it')
  else if (facts.pm2 === 'installed') add('ok', 'pm2', 'installed. To keep Fotobogen running on a server: pm2 start ecosystem.config.cjs')
  else if (facts.pm2 === 'missing') add('note', 'pm2', 'not installed', 'Only needed on a server, to keep Fotobogen running and start it again after a reboot: npm install -g pm2. Not needed on your own computer, or with Docker.')

  return checks
}

function linuxRelease(): Facts['linux'] {
  try {
    const fields = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n')
      .map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(match => match !== null)
      .map(match => [match[1], match[2]!.replace(/^"|"$/g, '')]))
    return { id: (fields.ID ?? '').toLowerCase(), like: (fields.ID_LIKE ?? '').toLowerCase().split(/\s+/).filter(Boolean), name: fields.PRETTY_NAME ?? fields.NAME ?? 'Linux' }
  }
  catch {
    return null
  }
}

function swapMb(): number | null {
  try {
    const line = readFileSync('/proc/meminfo', 'utf8').match(/^SwapTotal:\s+(\d+) kB/m)
    return line ? Number(line[1]) / 1024 : null
  }
  catch {
    return null
  }
}

function checkDataDir(dataDir: string): { problem: string | null, freeMb: number | null } {
  try {
    mkdirSync(dataDir, { recursive: true })
    accessSync(dataDir, constants.W_OK)
  }
  catch (error) {
    return { problem: error instanceof Error ? error.message : String(error), freeMb: null }
  }
  try {
    let dir = dataDir
    while (!existsSync(dir)) dir = dirname(dir)
    const disk = statfsSync(dir)
    return { problem: null, freeMb: Number(disk.bavail) * Number(disk.bsize) / 1024 / 1024 }
  }
  catch {
    return { problem: null, freeMb: null }
  }
}

async function checkImages(): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp')
    const missing = (['jpeg', 'png', 'webp', 'tiff', 'heif'] as const).filter(format => !sharp.format[format]?.input.file)
    if (missing.length > 0) return `the image library cannot read: ${missing.join(', ')}`
    if (!sharp.format.webp.output.file) return 'the image library cannot write WebP'
    // Prove it works, not just that it loaded.
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).webp().toBuffer()
    return null
  }
  catch (error) {
    return `the image library (sharp) did not load: ${error instanceof Error ? error.message.split('\n')[0] : error}`
  }
}

async function checkDatabase(): Promise<string | null> {
  try {
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(':memory:')
    db.prepare('select 1').get()
    db.close()
    return null
  }
  catch (error) {
    return `the database library (better-sqlite3) did not load: ${error instanceof Error ? error.message.split('\n')[0] : error}`
  }
}

/**
 * Whether pm2 is there. It is looked for on the PATH and never run: running
 * it would start its background process on a machine that may not want one.
 */
export function pm2State(env: Record<string, string | undefined>, exists: (path: string) => boolean = existsSync): 'running' | 'installed' | 'missing' | null {
  if (env.FOTOBOGEN_IN_DOCKER === '1' || exists('/.dockerenv')) return null
  if (env.pm_id !== undefined) return 'running'
  const windows = platform() === 'win32'
  const folders = (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':').filter(Boolean)
  const names = windows ? ['pm2.cmd', 'pm2.exe', 'pm2'] : ['pm2']
  return folders.some(folder => names.some(name => existsSync(join(folder, name)))) ? 'installed' : 'missing'
}

/** Looks at the machine. `dataDir` is where the site will keep its data. */
export async function gatherFacts(dataDir: string): Promise<Facts> {
  // In a container, the memory limit is what matters, not the host's memory.
  const limit = process.constrainedMemory?.() ?? 0
  const memoryBytes = limit > 0 && limit < totalmem() ? limit : totalmem()
  const data = checkDataDir(dataDir)
  return {
    nodeVersion: process.versions.node,
    platform: platform(),
    arch: arch(),
    linux: platform() === 'linux' ? linuxRelease() : null,
    memoryMb: memoryBytes / 1024 / 1024,
    swapMb: swapMb(),
    dataDir,
    freeDiskMb: data.freeMb,
    dataDirProblem: data.problem,
    imageProblem: await checkImages(),
    databaseProblem: await checkDatabase(),
    pm2: pm2State(process.env),
  }
}

export const passed = (checks: Check[]): boolean => checks.every(check => check.level !== 'fail')

/** The report as plain text. With `all` false, only warnings and failures are listed. */
export function formatReport(checks: Check[], all: boolean): string {
  const marks = { ok: '  ok  ', note: '  --  ', warn: ' WARN ', fail: ' FAIL ' }
  const lines: string[] = []
  for (const check of checks) {
    if (!all && (check.level === 'ok' || check.level === 'note')) continue
    lines.push(`${marks[check.level]} ${check.title}: ${check.detail}`)
    if (check.fix) lines.push(`        ${check.fix}`)
  }
  return lines.join('\n')
}
