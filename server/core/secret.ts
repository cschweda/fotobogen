// The session secret lives in the data directory so installers never have
// to set an environment variable (DESIGN.md section 6).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const MIN_LENGTH = 32

export function loadOrCreateSecret(file: string): string {
  if (existsSync(file)) {
    const secret = readFileSync(file, 'utf8').trim()
    if (secret.length < MIN_LENGTH) {
      // Replacing it silently would sign everyone out and hide the damage.
      throw new Error(
        `The session secret file ${file} is damaged (shorter than ${MIN_LENGTH} characters). `
        + 'Restore it from a backup, or delete it to generate a new one and sign everyone out.',
      )
    }
    return secret
  }
  const secret = randomBytes(32).toString('base64url')
  writeFileSync(file, secret + '\n', { mode: 0o600 })
  return secret
}
