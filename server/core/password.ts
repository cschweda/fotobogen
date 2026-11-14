// Password hashing with scrypt from node:crypto. The stored value records
// its own parameters, so they can be raised later without breaking old hashes:
//   scrypt$<N>$<r>$<p>$<salt, base64>$<hash, base64>
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 32768
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 256

function derive(plain: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs about 128 * N * r bytes; allow double that.
    const maxmem = 256 * n * r
    scrypt(plain.normalize('NFKC'), salt, length, { N: n, r, p, maxmem }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(plain, salt, N, R, P, KEY_LENGTH)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const salt = Buffer.from(parts[4]!, 'base64')
  const expected = Buffer.from(parts[5]!, 'base64')
  const sane = Number.isInteger(n) && Number.isInteger(r) && Number.isInteger(p)
    && n >= 1024 && n <= 2 ** 20 && r >= 1 && r <= 32 && p >= 1 && p <= 16
    && salt.length >= 8 && expected.length >= 16
  if (!sane) return false
  try {
    const actual = await derive(plain, salt, n, r, p, expected.length)
    return timingSafeEqual(actual, expected)
  }
  catch {
    return false
  }
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
}

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const

/**
 * A rough guide for the person choosing a password, not a rule: length counts
 * most, variety a little. Only the 12-character minimum is enforced.
 */
export function passwordStrength(plain: string): PasswordStrength {
  const length = [...plain].length
  if (length < PASSWORD_MIN_LENGTH) return { score: 0, label: LABELS[0] }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(plain)).length
  const distinct = new Set(plain).size
  let points = 1
  if (length >= 16) points += 1
  if (length >= 20) points += 1
  if (classes >= 3) points += 1
  if (distinct < 6) points = 1
  const score = Math.min(points, 4) as 1 | 2 | 3 | 4
  return { score, label: LABELS[score] }
}
