// The check that runs at the very start of install and build.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { problems } = createRequire(import.meta.url)('../../scripts/check-tools.cjs') as {
  problems: (facts: { nodeVersion: string, userAgent?: string, hasNvm?: boolean, windows?: boolean }) => string[][]
}
const text = (facts: Parameters<typeof problems>[0]) => problems(facts).map(lines => lines.join('\n')).join('\n')

describe('the check before installing and building', () => {
  it('passes with Node 24 and pnpm 10, or newer', () => {
    expect(problems({ nodeVersion: 'v24.22.3', userAgent: 'pnpm/10.33.4 npm/? node/v24.22.3 darwin arm64' })).toEqual([])
    expect(problems({ nodeVersion: 'v26.0.0', userAgent: 'pnpm/11.2.0 npm/? node/v26.0.0 linux x64' })).toEqual([])
    // Run by hand, with no installer involved: only Node is judged.
    expect(problems({ nodeVersion: 'v24.0.0' })).toEqual([])
  })

  it('stops an old Node, says which is in use, and gives the whole way back', () => {
    const plain = text({ nodeVersion: 'v22.23.4', userAgent: 'pnpm/10.33.4 npm/? node/v22.23.4 darwin arm64' })
    expect(plain).toContain('Node.js 24 or later is needed. This terminal is using Node.js 22.23.4.')
    expect(plain).toContain('https://nodejs.org')
    // What was installed under the old Node will not load under the new one.
    for (const step of ['rm -rf node_modules', 'pnpm install', 'pnpm build', 'pnpm start']) expect(plain).toContain(step)
    expect(text({ nodeVersion: 'v22.0.0', windows: true })).toContain('Remove-Item -Recurse -Force node_modules')
  })

  it('tells someone with nvm to switch this terminal, and to install pnpm again for the new Node', () => {
    const withNvm = text({ nodeVersion: 'v22.23.4', hasNvm: true })
    expect(withNvm).toContain('nvm use 24')
    expect(withNvm).toContain('npm install -g pnpm@10')
    // Setting the default does not change a terminal that is already open.
    expect(withNvm).toContain('nvm alias default 24')
    expect(withNvm).toContain('That does not change a terminal that is already open')
    expect(text({ nodeVersion: 'v22.23.4', hasNvm: false })).not.toContain('nvm')
  })

  it('stops npm, yarn, and an old pnpm, and says how to get the right one', () => {
    expect(text({ nodeVersion: 'v24.22.3', userAgent: 'npm/11.19.1 node/v24.22.3 darwin arm64' })).toContain('Fotobogen is installed with pnpm, not npm.')
    expect(text({ nodeVersion: 'v24.22.3', userAgent: 'yarn/1.22.22 npm/? node/v24.22.3' })).toContain('not yarn')
    expect(text({ nodeVersion: 'v24.22.3', userAgent: 'pnpm/8.15.4 npm/? node/v24.22.3' })).toContain('pnpm 10 or later is needed. This is pnpm 8.15.4.')
    // Both problems at once are both reported.
    expect(problems({ nodeVersion: 'v20.0.0', userAgent: 'npm/10.0.0 node/v20.0.0' })).toHaveLength(2)
  })

  it('runs as a script: silent and successful here, and a failure with the explanation under a wrong installer', () => {
    expect(execFileSync(process.execPath, ['scripts/check-tools.cjs'], { encoding: 'utf8', env: { ...process.env, npm_config_user_agent: 'pnpm/10.33.4 npm/? node/v24.22.3' } })).toBe('')
    const wrong = spawnSync(process.execPath, ['scripts/check-tools.cjs'], { encoding: 'utf8', env: { ...process.env, npm_config_user_agent: 'npm/11.19.1 node/v24.22.3' } })
    expect(wrong.status).toBe(1)
    expect(wrong.stderr).toContain('Fotobogen cannot be installed or built yet.')
    expect(wrong.stderr).toContain('npm install -g pnpm@10')
  })

  it('is wired to the first command and to building', async () => {
    const { scripts } = (await import('../../package.json', { with: { type: 'json' } })).default as { scripts: Record<string, string> }
    // pnpm runs a "preinstall" script only after installing, so the check for
    // `pnpm install` lives in the file pnpm reads first, and adds no hooks of its own.
    expect(scripts.preinstall).toBeUndefined()
    const pnpmfile = readFileSync('.pnpmfile.cjs', 'utf8')
    expect(pnpmfile).toContain("require('./scripts/check-tools.cjs')")
    expect(pnpmfile).toContain('check.run()')
    expect(pnpmfile).toContain('module.exports = {}')
    expect(scripts.build).toMatch(/^node scripts\/check-tools\.cjs && /)
    expect(scripts.dev).toMatch(/^node scripts\/check-tools\.cjs && /)
  })
})
