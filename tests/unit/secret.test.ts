import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadOrCreateSecret } from '../../server/core/secret.ts'
import { deleteSetupToken, loadOrCreateSetupToken, tokensMatch } from '../../server/core/setup-token.ts'

const tmp = () => mkdtempSync(join(tmpdir(), 'fb-'))

describe('loadOrCreateSecret', () => {
  it('creates a secret of at least 43 characters and returns the same one again', () => {
    const file = join(tmp(), 'secret')
    const first = loadOrCreateSecret(file)
    expect(first.length).toBeGreaterThanOrEqual(43)
    expect(loadOrCreateSecret(file)).toBe(first)
  })
  it.skipIf(process.platform === 'win32')('writes the file readable only by its owner', () => {
    const file = join(tmp(), 'secret')
    loadOrCreateSecret(file)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
  it('refuses a secret file that is too short instead of replacing it', () => {
    const file = join(tmp(), 'secret')
    writeFileSync(file, 'short')
    expect(() => loadOrCreateSecret(file)).toThrow(/secret/)
  })
})

describe('setup token', () => {
  it('is 32 hex characters and stable across calls', () => {
    const file = join(tmp(), 'setup-token')
    const token = loadOrCreateSetupToken(file)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(loadOrCreateSetupToken(file)).toBe(token)
  })
  it('is regenerated after deletion', () => {
    const file = join(tmp(), 'setup-token')
    const token = loadOrCreateSetupToken(file)
    deleteSetupToken(file)
    deleteSetupToken(file) // deleting twice is harmless
    expect(loadOrCreateSetupToken(file)).not.toBe(token)
  })
  it('matches equal tokens only', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true)
    expect(tokensMatch('a', 'ab')).toBe(false)
    expect(tokensMatch('abc', 'abd')).toBe(false)
    expect(tokensMatch('', '')).toBe(false)
  })
})
