import { describe, expect, it } from 'vitest'
import { hashPassword, passwordStrength, verifyPassword } from '../../server/core/password.ts'

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true)
  })
  it('accepts markup, quotes, and non-ASCII characters unchanged', async () => {
    const plain = '<script>"\'pässwörd 日本'
    expect(await verifyPassword(await hashPassword(plain), plain)).toBe(true)
  })
  it('rejects a wrong password', async () => {
    expect(await verifyPassword(await hashPassword('correct horse battery'), 'correct horse batterz')).toBe(false)
  })
  it('salts: the same password hashes differently each time', async () => {
    expect(await hashPassword('correct horse battery')).not.toBe(await hashPassword('correct horse battery'))
  })
  it('returns false for a malformed stored value', async () => {
    expect(await verifyPassword('garbage', 'anything at all')).toBe(false)
    expect(await verifyPassword('scrypt$x$y$z$aa$bb', 'anything at all')).toBe(false)
  })
})

describe('passwordStrength', () => {
  it('calls anything under 12 characters too short', () => {
    expect(passwordStrength('Abc123!xyz_')).toEqual({ score: 0, label: 'Too short' })
  })
  it('rates longer and more varied passwords higher', () => {
    expect(passwordStrength('aaaaaaaaaaaa').score).toBe(1)
    expect(passwordStrength('correct horse battery staple').score).toBeGreaterThanOrEqual(3)
    expect(passwordStrength('Tr0ub4dor&3-and-a-long-tail!').label).toBe('Strong')
  })
})
