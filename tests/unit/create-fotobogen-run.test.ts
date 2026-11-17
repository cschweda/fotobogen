// The one-line installer, run for real against a small repository on this
// machine, with a stand-in for pnpm that records what it was asked to do.
// (Not on Windows, where the stand-in would have to be a batch file.)
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const BIN = join(import.meta.dirname, '..', '..', 'create-fotobogen', 'bin', 'create-fotobogen.mjs')

describe.skipIf(process.platform === 'win32')('create-fotobogen, run', () => {
  let source: string
  let tools: string
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  }
  const release = (version: string) => {
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'fotobogen', version }))
    git(source, 'add', '-A')
    git(source, 'commit', '-q', '-m', `Release ${version}`)
    git(source, 'tag', `v${version}`)
  }
  /** Runs the installer in a new empty folder. `pnpm` says which pnpm it finds: a version, or none. */
  const install = (args: string[], options: { pnpm?: string | null, failOn?: string } = {}) => {
    const cwd = mkdtempSync(join(tmpdir(), 'fb-create-'))
    const bin = mkdtempSync(join(tmpdir(), 'fb-create-bin-'))
    const log = join(cwd, 'pnpm.log')
    if (options.pnpm !== null) {
      writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${options.pnpm ?? '10.4.1'}"; exit 0; fi\necho "$1 in $(pwd)" >> "${log}"\n[ "$1" = "${options.failOn ?? 'nothing'}" ] && exit 3\nexit 0\n`)
      chmodSync(join(bin, 'pnpm'), 0o755)
    }
    // git and node come from where they really are; pnpm only from the stand-in's folder.
    const path = [bin, tools].join(delimiter)
    const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { PATH: path, HOME: cwd, CREATE_FOTOBOGEN_REPO: source } })
    return { cwd, code: result.status, out: result.stdout + result.stderr, pnpm: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] }
  }

  beforeAll(() => {
    source = mkdtempSync(join(tmpdir(), 'fb-create-source-'))
    git(source, 'init', '-q', '-b', 'main')
    release('1.9.0')
    release('1.10.0')
    // Work after the newest release, not yet released: it must not be what gets installed.
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'fotobogen', version: '1.11.0-unreleased' }))
    git(source, 'commit', '-q', '-am', 'Work in progress')
    git(source, 'tag', 'create-fotobogen-v9.9.9')
    // A folder holding only git and node, so that no real pnpm on this machine is found.
    tools = mkdtempSync(join(tmpdir(), 'fb-create-tools-'))
    for (const tool of ['git', 'sh', 'dirname', 'basename', 'uname', 'sed', 'tr']) {
      const where = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim()
      if (where) writeFileSync(join(tools, tool), `#!/bin/sh\nexec "${where}" "$@"\n`, { mode: 0o755 })
    }
  })

  it('installs the newest release into the folder named, builds it, and says how to start it', () => {
    const { cwd, code, out, pnpm } = install(['fotobogen-live', '--yes'])
    expect(out).toContain('Version 1.10.0.')
    expect(code).toBe(0)
    const folder = join(cwd, 'fotobogen-live')
    expect(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version).toBe('1.10.0')
    expect(pnpm.map(line => line.split(' in ')[0])).toEqual(['install', 'build']) // and not started: --yes asks nothing
    expect(pnpm.every(line => line.endsWith('fotobogen-live'))).toBe(true)
    expect(out).toContain('Fotobogen 1.10.0 is installed in')
    expect(out).toMatch(/cd fotobogen-live\n {2}pnpm start/)
    // It is a git checkout on its branch, so updating works afterwards.
    expect(spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: folder, encoding: 'utf8' }).stdout.trim()).toBe('main')
    expect(spawnSync('git', ['status', '--porcelain'], { cwd: folder, encoding: 'utf8' }).stdout).toBe('')
  })

  it('uses the folder "fotobogen" when none is named and nothing can be asked', () => {
    const { cwd, code } = install([])
    expect(code).toBe(0)
    expect(existsSync(join(cwd, 'fotobogen', 'package.json'))).toBe(true)
  })

  it('installs an older release when asked for one, and refuses one that does not exist', () => {
    const older = install(['site', '--release', '1.9.0'])
    expect(older.code).toBe(0)
    expect(JSON.parse(readFileSync(join(older.cwd, 'site', 'package.json'), 'utf8')).version).toBe('1.9.0')
    const missing = install(['site', '--release', '7.7.7'])
    expect(missing).toMatchObject({ code: 1, pnpm: [] })
    expect(missing.out).toContain('There is no version 7.7.7')
  })

  it('never installs into a folder that already exists, and says so before doing anything else', () => {
    const first = install(['site', '--yes'])
    const cwd = first.cwd
    writeFileSync(join(cwd, 'site', 'my-notes.txt'), 'keep me')
    mkdirSync(join(cwd, 'empty'))
    mkdirSync(join(cwd, 'fotobogen'))
    writeFileSync(join(cwd, 'a-file'), 'x')
    // No pnpm at all on the path: the folder is looked at first, so that is what is reported.
    const again = (args: string[]) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { PATH: tools, HOME: cwd, CREATE_FOTOBOGEN_REPO: source } })

    const taken = again(['site', '--yes'])
    expect(taken.status).toBe(1)
    expect(taken.stderr).toContain('already exists')
    // It is an install of Fotobogen: say which, and how to update it instead.
    expect(taken.stderr).toContain('It holds Fotobogen 1.10.0')
    expect(taken.stderr).toContain('npx create-fotobogen@latest site-2')
    expect(taken.stdout).not.toContain('Checking for')
    expect(readFileSync(join(cwd, 'site', 'my-notes.txt'), 'utf8')).toBe('keep me')

    // An empty folder is still a folder that exists; so is the default name; a file is not a folder.
    expect(again(['empty', '--yes'])).toMatchObject({ status: 1, stderr: expect.stringContaining('already exists') })
    expect(again(['--yes'])).toMatchObject({ status: 1, stderr: expect.stringContaining('"fotobogen" already exists') })
    expect(again(['a-file', '--yes'])).toMatchObject({ status: 1, stderr: expect.stringContaining('already exists') })
    expect(again(['no-such-parent/site', '--yes'])).toMatchObject({ status: 1, stderr: expect.stringContaining('There is no folder') })
    expect(readdirSync(join(cwd, 'empty'))).toEqual([])
  })

  it('stops before fetching anything when pnpm is missing or too old and it cannot ask', () => {
    for (const pnpm of [null, '9.15.0']) {
      const { cwd, code, out } = install(['site', '--yes'], { pnpm })
      expect(code, String(pnpm)).toBe(1)
      expect(out, String(pnpm)).toContain('npm install -g pnpm@10')
      expect(existsSync(join(cwd, 'site')), String(pnpm)).toBe(false)
    }
  })

  it('says how to carry on when a step fails, and passes the failure on', () => {
    const { cwd, code, out, pnpm } = install(['site', '--yes'], { failOn: 'build' })
    expect(code).toBe(1)
    expect(pnpm.map(line => line.split(' in ')[0])).toEqual(['install', 'build'])
    expect(out).toContain('The build did not finish')
    expect(out).toMatch(/cd site\n {2}pnpm build\n {2}pnpm start/)
    expect(existsSync(join(cwd, 'site', 'package.json'))).toBe(true) // what was fetched is kept
  })

  it('prints its help and its version without doing anything', () => {
    const help = install(['--help'])
    expect(help.code).toBe(0)
    expect(help.out).toContain('npx create-fotobogen@latest [folder] [options]')
    const own = JSON.parse(readFileSync(join(BIN, '..', '..', 'package.json'), 'utf8')).version
    expect(install(['--version']).out.trim()).toBe(own)
    expect(install(['a', 'b'])).toMatchObject({ code: 1 })
  })
})
