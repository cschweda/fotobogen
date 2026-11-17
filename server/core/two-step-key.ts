// The key two-step login uses, kept once per server account rather than
// once per site: every Fotobogen installed by the same account shares it, so
// an authenticator app holds one entry for the server however many sites are
// made and deleted there. A site that switches two-step login on copies the
// key into its own database, so the site goes on working if this file is lost.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { base32Decode, base32Encode, newTotpKey } from './totp.ts'

type Env = Record<string, string | undefined>

export interface ServerKey {
  key: string
  /** Whether a code from it has been accepted once, so some phone is known to hold it. */
  confirmed: boolean
  /** The key came from the TWO_STEP_KEY setting, not from a file. */
  fromSetting?: boolean
}

/**
 * Where the key is kept: where TWO_STEP_KEY_FILE says; else the account's home
 * folder; else (inside Docker, where the home folder does not last, or for an
 * account with no home) the site's data folder.
 */
export function keyFileFor(env: Env, home: string, dataDir: string): string {
  const given = env.TWO_STEP_KEY_FILE?.trim()
  if (given) return given
  if (env.FOTOBOGEN_IN_DOCKER === '1' || !home) return join(dataDir, 'two-step-key.json')
  return join(home, '.fotobogen', 'two-step-key.json')
}

/** True when the file is one every site of this account shares, rather than this site's own. */
export function keyIsShared(env: Env, home: string): boolean {
  return Boolean(env.TWO_STEP_KEY?.trim() || env.TWO_STEP_KEY_FILE?.trim() || (env.FOTOBOGEN_IN_DOCKER !== '1' && home))
}

/** The server's key, made the first time it is asked for. */
export function loadServerKey(file: string, env: Env): ServerKey {
  const setting = env.TWO_STEP_KEY?.trim()
  if (setting) {
    let bytes: Buffer
    try {
      bytes = base32Decode(setting)
    }
    catch {
      bytes = Buffer.alloc(0)
    }
    if (bytes.length < 16) throw new Error('TWO_STEP_KEY is not a key an authenticator app would give: it is letters A to Z and digits 2 to 7, at least 26 of them.')
    return { key: base32Encode(bytes), confirmed: true, fromSetting: true }
  }
  if (existsSync(file)) {
    try {
      const kept = JSON.parse(readFileSync(file, 'utf8')) as { key?: unknown, confirmed?: unknown }
      if (typeof kept.key !== 'string' || base32Decode(kept.key).length < 16) throw new Error('no key')
      return { key: kept.key, confirmed: kept.confirmed === true }
    }
    catch {
      // Replacing it silently would leave every phone holding the old key with codes that no longer work.
      throw new Error(`The two-step login key file ${file} is damaged. Restore it, or delete it to make a new key (sites that already use two-step login are not affected: each keeps its own copy).`)
    }
  }
  const made: ServerKey = { key: newTotpKey(), confirmed: false }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, JSON.stringify(made) + '\n', { mode: 0o600, flag: 'wx' })
  return made
}

export function markServerKeyConfirmed(file: string): void {
  if (!existsSync(file)) return
  const kept = JSON.parse(readFileSync(file, 'utf8')) as ServerKey
  if (kept.confirmed === true) return
  writeFileSync(file, JSON.stringify({ key: kept.key, confirmed: true }) + '\n', { mode: 0o600 })
}
