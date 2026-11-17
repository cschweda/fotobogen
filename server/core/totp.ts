// The codes an authenticator app shows (RFC 6238: SHA-1, six digits, a new
// code every 30 seconds), and the backup codes that stand in for them.
// Nothing here knows about the site: it is arithmetic, tested against the
// standard's own examples.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_MS = 30_000

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Reads a key as a person may have typed it: either case, with spaces or hyphens. Throws on anything else. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Not a key an authenticator app would give.')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const letter of clean) {
    value = ((value << 5) | ALPHABET.indexOf(letter)) & 0xfff
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new key: 160 bits, as the standard recommends, written the way apps expect. */
export function newTotpKey(): string {
  return base32Encode(randomBytes(20))
}

function codeForStep(key: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', base32Decode(key)).update(counter).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(number).padStart(6, '0')
}

/** The code an app shows at this moment. */
export function totpAt(key: string, nowMs: number): string {
  return codeForStep(key, Math.floor(nowMs / STEP_MS))
}

/**
 * Whether the code is right, now or half a minute either side (clocks differ).
 * Answers the half minute the code belongs to, to be remembered as `lastStep`:
 * a code from that half minute or an earlier one is then never accepted again.
 */
export function checkTotp(key: string, given: string, nowMs: number, lastStep: number | null): number | null {
  const code = given.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return null
  const now = Math.floor(nowMs / STEP_MS)
  let matched: number | null = null
  // Every candidate is compared, whichever matches, so the time taken says nothing.
  for (const step of [now - 1, now, now + 1]) {
    const same = timingSafeEqual(Buffer.from(codeForStep(key, step)), Buffer.from(code))
    if (same && matched === null && (lastStep === null || step > lastStep)) matched = step
  }
  return matched
}

/** The address an authenticator app reads from a QR code. The name is what the app lists the entry under. */
export function otpauthUri(key: string, name: string): string {
  return `otpauth://totp/Fotobogen:${encodeURIComponent(name)}?secret=${key}&issuer=Fotobogen`
}

// No i, l, o, 0 or 1: nothing that is misread from a printed page.
const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
export const BACKUP_CODE_COUNT = 10

/** Ten backup codes, each good once: about 49 bits apiece. */
export function newBackupCodes(): string[] {
  const codes = new Set<string>()
  while (codes.size < BACKUP_CODE_COUNT) {
    let code = ''
    for (let index = 0; index < 10; index++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)]
    codes.add(`${code.slice(0, 5)}-${code.slice(5)}`)
  }
  return [...codes]
}

/** A backup code as typed, put in the form they are kept in; null when it is not shaped like one. */
export function cleanBackupCode(given: string): string | null {
  const code = given.replace(/[\s-]/g, '').toLowerCase()
  return /^[a-z2-9]{10}$/.test(code) ? `${code.slice(0, 5)}-${code.slice(5)}` : null
}
