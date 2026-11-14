// A fresh install can only be claimed by someone who can read the server's
// logs or data directory (DESIGN.md section 5).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function loadOrCreateSetupToken(file: string): string {
  if (existsSync(file)) {
    const token = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{32}$/.test(token)) return token
  }
  const token = randomBytes(16).toString('hex')
  writeFileSync(file, token + '\n', { mode: 0o600 })
  return token
}

export function deleteSetupToken(file: string): void {
  rmSync(file, { force: true })
}

/** Constant-time comparison. Hashing first makes the lengths equal. */
export function tokensMatch(given: string, expected: string): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
