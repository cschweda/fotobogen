// Updating Fotobogen from inside itself, tried on real git repositories made
// for the purpose: a place releases come from ("origin") and a copy cloned
// from it, as an install is.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markUpdateStarted, readUpdateState, runUpdate, updateInProgress, updateSupport, type Exec } from '../../server/core/updater.ts'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const NODE = process.execPath

/** A release: the files of that version, committed and tagged. `build.js` stands in for the real build. */
function release(origin: string, version: string, files: Record<string, string> = {}) {
  writeFileSync(join(origin, 'package.json'), `${JSON.stringify({ name: 'fotobogen', version }, null, 2)}\n`)
  writeFileSync(join(origin, 'build.js'), 'require("node:fs").writeFileSync("built.txt", require("./package.json").version)\n')
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(origin, name), contents)
  git(origin, 'add', '-A')
  git(origin, 'commit', '-q', '-m', `Version ${version}`)
  git(origin, 'tag', `v${version}`)
}

/** An origin with version 1.0.0, a copy cloned from it, and then the given later releases published. */
function site(later: [string, Record<string, string>?][] = [['1.1.0']]) {
  const base = mkdtempSync(join(tmpdir(), 'fb-update-'))
  const origin = join(base, 'origin')
  const copy = join(base, 'copy')
  const dataDir = join(base, 'data')
  execFileSync('git', ['init', '-q', '-b', 'main', origin])
  for (const [key, value] of [['user.email', 'test@example.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false']]) git(origin, 'config', key!, value!)
  release(origin, '1.0.0', { 'settings.cjs': 'module.exports = { port: 5150 }\n' })
  execFileSync('git', ['clone', '-q', origin, copy])
  for (const [version, files] of later) release(origin, version, files)
  let snapshots = 0
  const update = (version: string, extra: Partial<Parameters<typeof runUpdate>[0]> = {}) => runUpdate({
    root: copy, dataDir, version, snapshot: () => { snapshots++; return join(dataDir, 'before-update.db') },
    // The real commands are "pnpm install" and "pnpm build"; here, nothing to install, and each release's own build.js.
    install: [NODE, ['-e', '']], build: [NODE, ['build.js']], ...extra,
  })
  const installed = () => (JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8')) as { version: string }).version
  return { origin, copy, dataDir, update, installed, snapshots: () => snapshots }
}

describe('updating a copy installed with git', () => {
  it('fetches the release, switches to it, installs, and builds, keeping a copy of the database first', async () => {
    const { copy, dataDir, update, installed, snapshots } = site()
    const before = git(copy, 'rev-parse', 'HEAD')
    const result = await update('1.1.0')

    expect(result).toMatchObject({ state: 'done', version: '1.1.0', from: '1.0.0', error: null, pid: null })
    expect(installed()).toBe('1.1.0')
    expect(readFileSync(join(copy, 'built.txt'), 'utf8')).toBe('1.1.0')
    expect(snapshots()).toBe(1)
    // Still on its branch, moved forward, so "git pull" keeps working afterwards.
    expect(git(copy, 'symbolic-ref', '--short', 'HEAD')).toBe('main')
    expect(git(copy, 'rev-parse', 'HEAD')).not.toBe(before)
    expect(git(copy, 'describe', '--tags', '--exact-match')).toBe('v1.1.0')
    // The steps, in order, as the admin shows them; and the same is kept for the admin to read.
    expect(result.log.filter(line => !line.startsWith('    '))).toEqual([
      'Saving a copy of the database', 'Fetching version 1.1.0', 'Switching to version 1.1.0', 'Installing its packages',
      'Building it (the site may be slow or show errors for a minute or two)', 'Version 1.1.0 is built and ready',
    ])
    expect(readUpdateState(dataDir)).toMatchObject({ state: 'done', version: '1.1.0' })
  })

  it('goes back to the old version, and builds it again, when the new one will not build', async () => {
    // A release whose build fails.
    const { copy, update, installed } = site([['1.1.0', { 'build.js': 'process.exit(1)\n' }]])
    const before = git(copy, 'rev-parse', 'HEAD')
    // (The origin's build.js for 1.1.0 was overwritten by release(); make it the failing one.)
    const result = await update('1.1.0', { build: [NODE, ['-e', 'if (require("./package.json").version === "1.1.0") { console.error("out of memory"); process.exit(1) } require("node:fs").writeFileSync("built.txt", "1.0.0")']] })

    expect(result.state).toBe('failed')
    expect(result.error).toBe('The new version could not be built. This usually means the server ran out of memory; it needs about 2 GB, counting swap. The site was put back to version 1.0.0 and is unchanged.')
    expect(installed()).toBe('1.0.0')
    expect(git(copy, 'rev-parse', 'HEAD')).toBe(before)
    expect(readFileSync(join(copy, 'built.txt'), 'utf8')).toBe('1.0.0')
    // What the failing command said is kept, for the owner to read.
    expect(result.log.join('\n')).toContain('out of memory')
    expect(result.log).toContain('Going back to version 1.0.0')
  })

  it('leaves files changed on the server alone, whether the update works or is undone', async () => {
    const changed = 'module.exports = { port: 8080 }\n'
    const worked = site()
    writeFileSync(join(worked.copy, 'settings.cjs'), changed)
    expect((await worked.update('1.1.0')).state).toBe('done')
    expect(readFileSync(join(worked.copy, 'settings.cjs'), 'utf8')).toBe(changed)

    const undone = site()
    writeFileSync(join(undone.copy, 'settings.cjs'), changed)
    const result = await undone.update('1.1.0', { build: [NODE, ['-e', 'if (require("./package.json").version === "1.1.0") process.exit(1)']] })
    expect(result.state).toBe('failed')
    expect(undone.installed()).toBe('1.0.0')
    expect(readFileSync(join(undone.copy, 'settings.cjs'), 'utf8')).toBe(changed)
  })

  it('changes nothing when a file changed on the server stands in the way', async () => {
    // The release changes settings.cjs, and so did the owner.
    const { copy, update, installed } = site([['1.1.0', { 'settings.cjs': 'module.exports = { port: 5150, host: "::" }\n' }]])
    writeFileSync(join(copy, 'settings.cjs'), 'module.exports = { port: 8080 }\n')
    const before = git(copy, 'rev-parse', 'HEAD')
    const result = await update('1.1.0')
    expect(result.state).toBe('failed')
    expect(result.error).toBe('Files changed on this server stand in the way of the new version. Undo those changes, or update by hand. Nothing was changed.')
    expect(installed()).toBe('1.0.0')
    expect(git(copy, 'rev-parse', 'HEAD')).toBe(before)
    expect(readFileSync(join(copy, 'settings.cjs'), 'utf8')).toBe('module.exports = { port: 8080 }\n')
    expect(existsSync(join(copy, 'built.txt'))).toBe(false)
  })

  it('refuses a version that is not a release, is not newer, or is not a version at all, and changes nothing', async () => {
    const { copy, update, installed, snapshots } = site()
    const before = git(copy, 'rev-parse', 'HEAD')
    expect((await update('9.9.9')).error).toBe('Version 9.9.9 was not found where this copy was cloned from. Nothing was changed.')
    expect((await update('1.0.0')).error).toBe('Version 1.0.0 is not newer than the one installed (1.0.0). Nothing was changed.')
    expect((await update('0.9.0')).error).toBe('Version 0.9.0 is not newer than the one installed (1.0.0). Nothing was changed.')
    // Never reaches a command line: it is not three numbers.
    for (const bad of ['1.1.0; rm -rf ~', 'main', '--upload-pack=evil', '', '1.1']) {
      const result = await update(bad)
      expect(result.state, bad).toBe('failed')
      expect(result.error, bad).toBe(`"${bad}" is not a version number. Nothing was changed.`)
    }
    expect(installed()).toBe('1.0.0')
    expect(git(copy, 'rev-parse', 'HEAD')).toBe(before)
    // Only the attempts that got as far as a real version saved the database.
    expect(snapshots()).toBe(1)
  })

  it('will not move a copy that has commits of its own which the release does not contain', async () => {
    const { copy, update, installed } = site()
    for (const [key, value] of [['user.email', 'owner@example.com'], ['user.name', 'Owner'], ['commit.gpgsign', 'false']]) git(copy, 'config', key!, value!)
    writeFileSync(join(copy, 'mine.txt'), 'my own change\n')
    git(copy, 'add', '-A')
    git(copy, 'commit', '-q', '-m', 'My own change')
    const result = await update('1.1.0')
    expect(result.error).toBe('This copy has changes that are not part of version 1.1.0, so it cannot simply move to it. Update it by hand. Nothing was changed.')
    expect(installed()).toBe('1.0.0')
    expect(existsSync(join(copy, 'mine.txt'))).toBe(true)
  })

  it('updates a copy that is not on a branch, and can skip a version', async () => {
    const { copy, update, installed } = site([['1.1.0'], ['1.2.0']])
    git(copy, 'checkout', '-q', 'v1.0.0')
    expect((await update('1.2.0')).state).toBe('done')
    expect(installed()).toBe('1.2.0')
    expect(git(copy, 'describe', '--tags', '--exact-match')).toBe('v1.2.0')
  })
})

describe('whether a copy can update itself', () => {
  const works: Exec = async () => ({ code: 0, output: '1.0.0' })
  const here = (paths: string[]) => (path: string) => paths.some(known => path.endsWith(known))

  it('can, when it was installed with git and has git and pnpm', async () => {
    expect(await updateSupport('/srv/fotobogen', {}, works, here(['.git']))).toEqual({ method: 'source', restart: 'manual', reason: null })
  })
  it('knows that pm2 will start it again by itself', async () => {
    expect((await updateSupport('/srv/fotobogen', { pm_id: '0' }, works, here(['.git']))).restart).toBe('automatic')
  })
  it('cannot in Docker, and says the container is updated from the server', async () => {
    expect(await updateSupport('/app', { FOTOBOGEN_IN_DOCKER: '1' }, works, here(['.git']))).toMatchObject({ method: 'docker', reason: expect.stringContaining('A container cannot replace itself') })
    expect((await updateSupport('/app', {}, works, here(['/.dockerenv', '.git']))).method).toBe('docker')
  })
  it('cannot without a git checkout, or without git or pnpm, and says which', async () => {
    expect(await updateSupport('/srv/fotobogen', {}, works, here([]))).toMatchObject({ method: 'none', reason: expect.stringContaining('not installed with git') })
    const noPnpm: Exec = async command => ({ code: command === 'pnpm' ? 127 : 0, output: '' })
    expect(await updateSupport('/srv/fotobogen', {}, noPnpm, here(['.git']))).toMatchObject({ method: 'none', reason: 'pnpm was not found on this server, and updating needs it.' })
  })
})

describe('the record of an update', () => {
  it('is empty before any update, and survives a damaged file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-update-state-'))
    expect(readUpdateState(dir)).toMatchObject({ state: 'idle', version: null, log: [] })
    writeFileSync(join(dir, 'update-status.json'), '{ not json')
    expect(readUpdateState(dir).state).toBe('idle')
  })
  it('says an update is under way from the moment it is started', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-update-state-'))
    markUpdateStarted(dir, { version: '1.1.0', from: '1.0.0', pid: process.pid })
    const state = readUpdateState(dir)
    expect(state).toMatchObject({ state: 'running', version: '1.1.0', from: '1.0.0', step: 'Starting', log: ['Starting'] })
    expect(updateInProgress(state)).toBe(true)
  })
  it('counts as in progress only while the process doing it is alive', () => {
    const base = { state: 'running' as const, version: '1.1.0', from: '1.0.0', step: null, startedAt: 1, finishedAt: null, error: null, log: [] }
    expect(updateInProgress({ ...base, pid: process.pid })).toBe(true)
    // A process id that is not in use: the update was cut off.
    expect(updateInProgress({ ...base, pid: 2 ** 22 + 12345 })).toBe(false)
    expect(updateInProgress({ ...base, state: 'done', pid: process.pid })).toBe(false)
  })
})
