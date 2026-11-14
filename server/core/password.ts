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

// The strength estimate lives in shared/ because the wizard runs it in the browser.
export { passwordStrength, type PasswordStrength } from '../../shared/password-strength.ts'
