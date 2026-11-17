import { describe, expect, it } from 'vitest'
// The one-line installer (npx create-fotobogen): the decisions it makes.
import { BANNER, compareVersions, folderProblem, freeName, majorOf, newestRelease, parseArgs, releaseVersion, saysYes, toolProblems } from '../../create-fotobogen/lib/plan.mjs'

describe('create-fotobogen', () => {
  it('reads the command line', () => {
    expect(parseArgs([])).toMatchObject({ folder: null, release: null, yes: false, start: true, help: false, version: false, problem: null })
    expect(parseArgs(['fotobogen-live', '--yes'])).toMatchObject({ folder: 'fotobogen-live', yes: true, problem: null })
    expect(parseArgs(['-y', '--no-start', '--release', 'v1.6.0'])).toMatchObject({ yes: true, start: false, release: '1.6.0' })
    expect(parseArgs(['--release=1.7.0'])).toMatchObject({ release: '1.7.0', problem: null })
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

  it('reads a yes or no, with Enter taking the default', () => {
    expect([saysYes('', true), saysYes('', false), saysYes(' Y ', false), saysYes('no', true), saysYes('maybe', true)]).toEqual([true, false, true, false, null])
  })
})
