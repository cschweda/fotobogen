// Two-step login: a code from an authenticator app asked for after the
// password. It is an option the owner switches on. The key comes from the
// server's one key (core/two-step-key.ts) and is copied into this site's
// database when it is switched on, with ten backup codes.
import { timingSafeEqual } from 'node:crypto'
import { homedir, hostname } from 'node:os'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { createError, type RequestEvent } from 'nuxt/server'
import qrcode from 'qrcode-generator'
import { verifyPassword } from '../core/password.ts'
import { createFailureLimiter } from '../core/rate-limit.ts'
import { checkTotp, cleanBackupCode, newBackupCodes, otpauthUri } from '../core/totp.ts'
import { keyFileFor, keyIsShared, loadServerKey, markServerKeyConfirmed, type ServerKey } from '../core/two-step-key.ts'
import { users } from '../db/schema.ts'
import { getDb, getPaths } from './app.ts'
import { failureLimiter, limiterKey, tooManyAttempts } from './limiter.ts'
import { fail } from './respond.ts'
import { requireAdmin } from './session.ts'
import { getSetting } from './settings.ts'

type User = typeof users.$inferSelect

/**
 * Wrong codes are also counted for the account as a whole, wherever they come
 * from: ten in fifteen minutes, and then no code is looked at until the wait is
 * over. The limit per address alone would let someone who has the password
 * guess at codes from many addresses at once. Only someone who already has the
 * password can reach this, so it cannot be used to keep the owner out by a stranger.
 */
export const codeLimiter = createFailureLimiter({ max: 10, windowMs: 15 * 60_000 })

function home(): string {
  try {
    return homedir()
  }
  catch {
    return ''
  }
}

export function serverKeyFile(): string {
  return keyFileFor(process.env, home(), getPaths().root)
}

export function serverKey(): ServerKey {
  return loadServerKey(serverKeyFile(), process.env)
}

/**
 * What the authenticator app lists the entry under. One key serves every site
 * on the server, so it is named after the server; a site with a key of its
 * own (in Docker) is named after the site.
 */
export function entryName(): string {
  const name = keyIsShared(process.env, home()) ? hostname() : getSetting<string>('site.title', '')
  return (name.trim() || 'this site').slice(0, 60)
}

/** The QR code for a key, as rows of 1 (dark) and 0, for the page to draw. */
export function qrRows(text: string): string[] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => qr.isDark(row, column) ? '1' : '0').join(''))
}

/** Everything an app or a person needs to add the key. */
export function keyDetails(key: string) {
  const name = entryName()
  const uri = otpauthUri(key, name)
  return { name: `Fotobogen (${name})`, key: key.replace(/(.{4})(?=.)/g, '$1 '), uri, qr: qrRows(uri) }
}

/**
 * The owner, logged in with a password: these settings decide who can get
 * into the site, so no API token reaches them and a demo visitor sees nothing.
 */
export async function requireOwner(event: RequestEvent): Promise<User> {
  const admin = await requireAdmin(event)
  if (admin.token) throw createError({ status: 403, message: 'An API token cannot read or change two-step login. Log in to the admin to do that.' })
  const user = admin.demo ? undefined : getDb().select().from(users).where(eq(users.id, admin.id)).get()
  if (!user) throw createError({ status: 403, message: 'This is for the owner of the site.' })
  return user
}

/**
 * Asks for the password again before anything that shows or changes the way
 * in, so a browser left open is not enough. Wrong passwords count against the
 * same limit as a login. Answers a refusal to send, or null when it was right.
 */
export async function passwordRefusal(event: RequestEvent, user: User, password: unknown) {
  const key = limiterKey(event)
  if (failureLimiter.isBlocked(key)) return tooManyAttempts(event, key)
  failureLimiter.recordFailure(key)
  if (typeof password !== 'string' || !password || !(await verifyPassword(user.passwordHash, password.slice(0, 256)))) {
    return fail(event, 401, 'That password is not right.')
  }
  failureLimiter.clear(key)
  return null
}

/** Switches it on, given a code that proves a phone holds the server's key. Answers the backup codes, or null for a wrong code. */
export function enableTwoStep(user: User, code: string, now = Date.now()): string[] | null {
  const server = serverKey()
  const step = checkTotp(server.key, code, now, null)
  if (step === null) return null
  const codes = newBackupCodes()
  // A new session version signs out every other browser: anyone who was in before must now pass both steps.
  getDb().update(users).set({
    totpSecret: server.key,
    totpLastStep: step,
    backupCodes: codes.map(code => ({ code, usedAt: null })),
    sessionVersion: user.sessionVersion + 1,
  }).where(eq(users.id, user.id)).run()
  if (!server.fromSetting) markServerKeyConfirmed(serverKeyFile())
  return codes
}

export function disableTwoStep(user: User): void {
  getDb().update(users).set({ totpSecret: null, totpLastStep: null, backupCodes: null }).where(eq(users.id, user.id)).run()
}

export function replaceBackupCodes(user: User): string[] {
  const codes = newBackupCodes()
  getDb().update(users).set({ backupCodes: codes.map(code => ({ code, usedAt: null })) }).where(eq(users.id, user.id)).run()
  return codes
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * The second step of a login: a code from the app, or a backup code. Either
 * is used up by being accepted. Answers which kind it was, or null.
 */
export function useLoginCode(user: User, given: string, now = Date.now()): 'app' | 'backup' | null {
  if (!user.totpSecret) return null
  const step = checkTotp(user.totpSecret, given, now, user.totpLastStep)
  if (step !== null) {
    // Only if no later code was accepted meanwhile: two logins with one code cannot both win.
    const taken = getDb().update(users).set({ totpLastStep: step })
      .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step)))).run()
    return taken.changes === 1 ? 'app' : null
  }
  const backup = cleanBackupCode(given)
  if (!backup) return null
  return getDb().transaction((tx) => {
    const codes = tx.select({ codes: users.backupCodes }).from(users).where(eq(users.id, user.id)).get()?.codes ?? []
    let found = -1
    codes.forEach((entry, index) => {
      if (sameText(entry.code, backup) && entry.usedAt === null) found = index
    })
    if (found < 0) return null
    codes[found]!.usedAt = now
    tx.update(users).set({ backupCodes: codes }).where(eq(users.id, user.id)).run()
    return 'backup' as const
  })
}
