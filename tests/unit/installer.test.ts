import { describe, expect, it } from 'vitest'
// The one-line installer (npx fotobogen): the decisions it makes.
import { BANNER, compareVersions, folderProblem, freeName, isOnPath, looksLikeForge, serverNotes, majorOf, newestRelease, parseArgs, releaseVersion, saysYes, toolProblems } from '../../installer/lib/plan.mjs'

describe('the installer (npx fotobogen)', () => {
  it('reads the command line', () => {
    expect(parseArgs([])).toMatchObject({ folder: null, release: null, yes: false, start: true, help: false, version: false, problem: null })
    expect(parseArgs(['fotobogen-live', '--yes'])).toMatchObject({ folder: 'fotobogen-live', yes: true, problem: null })
    expect(parseArgs(['-y', '--no-start', '--release', 'v1.6.0'])).toMatchObject({ yes: true, start: false, release: '1.6.0' })
    expect(parseArgs(['--release=1.7.0'])).toMatchObject({ release: '1.7.0', problem: null })
    // "install" may be said first, as in "npx fotobogen install": it is the only thing this does.
    expect(parseArgs(['install'])).toMatchObject({ folder: null, problem: null })
    expect(parseArgs(['install', 'fotobogen-live', '-y'])).toMatchObject({ folder: 'fotobogen-live', yes: true, problem: null })
    expect(parseArgs(['install', 'install'])).toMatchObject({ folder: 'install', problem: null })
    expect(parseArgs(['-y', 'install'])).toMatchObject({ folder: 'install' }) // only the first word is the command
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--version']).version).toBe(true)
  })

  it('says what is wrong with a command line it cannot use', () => {
    expect(parseArgs(['a', 'b']).problem).toContain('one folder')
    expect(parseArgs(['--force']).problem).toContain('no option --force')
    expect(parseArgs(['--release']).problem).toContain('--release takes a version')
    expect(parseArgs(['--release', 'latest; rm -rf ~']).problem).toContain('--release takes a version')
  })

  it('takes a version only in the form of a release', () => {
    expect(releaseVersion('1.7.0')).toBe('1.7.0')
    expect(releaseVersion(' v1.07.0 ')).toBe('1.7.0')
    for (const bad of ['', '1.7', '1.7.0-beta.1', 'main', '1.7.0 --upload-pack=x', 'v1.7.0\nv2', '--upload-pack=touch x']) expect(releaseVersion(bad), bad).toBeNull()
  })

  it('picks the newest release from the tags git lists, and nothing that is not a release', () => {
    const tags = [
      'aaa\trefs/tags/v1.9.0', 'bbb\trefs/tags/v1.10.0', 'ccc\trefs/tags/v1.10.0^{}', 'ddd\trefs/tags/v1.2.3',
      'eee\trefs/tags/v2.0.0-beta.1', 'fff\trefs/tags/create-fotobogen-v9.9.9', 'ggg\trefs/tags/v99.0.0.1', 'hhh\trefs/heads/v50.0.0', 'junk',
    ].join('\n')
    expect(newestRelease(tags)).toBe('1.10.0') // by number, not by spelling
    expect(newestRelease('')).toBeNull()
    expect(newestRelease('abc\trefs/tags/nightly\n')).toBeNull()
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.7.0', '1.7.0')).toBe(0)
  })

  it('refuses a folder name that cannot be a folder', () => {
    for (const fine of ['fotobogen', 'fotobogen-live', 'sites/photos.example.com', '/srv/www/my site', 'C:\\sites\\fotobogen', '../next-door']) expect(folderProblem(fine), fine).toBeNull()
    for (const bad of ['', '   ', '-rf', '--upload-pack=x', 'a\nb', 'what?', 'a|b', 'x'.repeat(300)]) expect(folderProblem(bad), bad).toBeTruthy()
  })

  it('says which tools are missing or too old, in the order to deal with them', () => {
    expect(toolProblems({ node: 'v24.1.0', git: 'git version 2.44.0', pnpm: '10.4.1' })).toEqual([])
    expect(toolProblems({ node: 'v20.11.0', git: null, pnpm: null }).map(problem => problem.tool)).toEqual(['node', 'git', 'pnpm'])
    expect(toolProblems({ node: 'v20.11.0', git: 'git version 2.44.0', pnpm: '10.0.0' })[0]!.message).toContain('needs Node.js 24')
    expect(toolProblems({ node: 'v24.0.0', git: 'x 2.1', pnpm: null })).toMatchObject([{ tool: 'pnpm', missing: true }])
    expect(toolProblems({ node: 'v24.0.0', git: 'x 2.1', pnpm: '9.15.0' })).toMatchObject([{ tool: 'pnpm', missing: false }])
    expect(majorOf('git version 2.44.0')).toBe(2)
    expect(majorOf('nothing')).toBeNull()
  })

  it('suggests a free name when the one asked for is taken', () => {
    const taken = new Set(['fotobogen', 'fotobogen-2', 'fotobogen-3'])
    expect(freeName('fotobogen', name => taken.has(name))).toBe('fotobogen-4')
    expect(freeName('sites/photos/', () => false)).toBe('sites/photos-2')
  })

  it('has a banner that prints on any terminal: plain ASCII, and narrow', () => {
    expect(BANNER.length).toBeGreaterThan(3)
    for (const line of BANNER) {
      expect(line).toMatch(/^[\x20-\x7e]*$/)
      expect(line.length).toBeLessThanOrEqual(60)
    }
  })

  it('recognises a server managed by Laravel Forge', () => {
    const none = () => false
    expect(looksLikeForge({ platform: 'linux', username: 'forge', exists: none })).toBe(true)
    expect(looksLikeForge({ platform: 'linux', username: 'root', exists: path => path === '/etc/nginx/forge-conf' })).toBe(true)
    expect(looksLikeForge({ platform: 'linux', username: 'deploy', exists: path => path === '/home/forge' })).toBe(true)
    expect(looksLikeForge({ platform: 'linux', username: 'ubuntu', exists: none })).toBe(false)
    // A Mac whose owner happens to be called forge is not a Forge server.
    expect(looksLikeForge({ platform: 'darwin', username: 'forge', exists: () => true })).toBe(false)
    expect(looksLikeForge({ platform: 'win32', username: 'forge', exists: () => true })).toBe(false)
  })

  it('always says where the pm2 settings file is, and how to get pm2 when it is missing', () => {
    const without = serverNotes({ folder: 'fotobogen-live', pm2: false, forge: false }).join('\n')
    expect(without).toContain('ecosystem.config.cjs, is already in the folder')
    expect(without).toContain('pm2 is not installed')
    expect(without).toContain('npm install -g pm2')
    expect(without).toContain('https://pm2.io')
    expect(without).toMatch(/cd fotobogen-live\n\s+pm2 start ecosystem\.config\.cjs/)
    expect(without).not.toContain('Forge')

    const having = serverNotes({ folder: 'site', pm2: true, forge: false }).join('\n')
    expect(having).toContain('pm2 is installed')
    expect(having).not.toContain('npm install -g pm2')
    expect(having).toContain('ecosystem.config.cjs')
    expect(having).toContain('pm2 save')
  })

  it('on a Forge server, says what nginx needs: the proxy, and room for uploads', () => {
    const notes = serverNotes({ folder: 'photos.example.com', pm2: true, forge: true }).join('\n')
    expect(notes).toContain('Laravel Forge')
    expect(notes).toContain('proxy_pass http://127.0.0.1:5150;')
    expect(notes).toContain('client_max_body_size 50m;')
    expect(notes).toContain('413')
    expect(notes).toContain('deploy/forge-nginx.conf')
    expect(notes).toContain('https://fotobogen.com/docs/installation/#forge-pm2')
    // Nothing that would not print on any terminal.
    expect(notes).toMatch(/^[\x20-\x7e\n]*$/)
  })

  it('finds a tool on the path without running it', () => {
    const files = new Set(['/usr/local/bin/pm2', 'C:\\Users\\me\\AppData\\Roaming\\npm\\pm2.cmd'])
    const exists = (path: string) => files.has(path)
    expect(isOnPath('pm2', { path: '/usr/bin:/usr/local/bin', platform: 'linux', exists })).toBe(true)
    expect(isOnPath('pm2', { path: '/usr/bin:/opt/bin', platform: 'linux', exists })).toBe(false)
    expect(isOnPath('pm2', { path: 'C:\\Windows;C:\\Users\\me\\AppData\\Roaming\\npm', platform: 'win32', exists })).toBe(true)
    expect(isOnPath('pm2', { path: '', platform: 'linux', exists })).toBe(false)
    expect(isOnPath('pm2', { path: undefined, platform: 'linux', exists })).toBe(false)
  })

  it('reads a yes or no, with Enter taking the default', () => {
    expect([saysYes('', true), saysYes('', false), saysYes(' Y ', false), saysYes('no', true), saysYes('maybe', true)]).toEqual([true, false, true, false, null])
  })
})
