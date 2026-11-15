import { eq } from 'drizzle-orm'
import { defineEventHandler, getRequestHeader, getRequestURL, readBody } from 'nuxt/server'
import { loginCanStick } from '../../core/request.ts'
import { loginSchema } from '../../../shared/schemas.ts'
import { hashPassword, verifyPassword } from '../../core/password.ts'
import { users } from '../../db/schema.ts'
import { getDb } from '../../utils/app.ts'
import { failureLimiter, limiterKey, tooManyAttempts } from '../../utils/limiter.ts'
import { fail } from '../../utils/respond.ts'
import { DEMO_PASSWORD, DEMO_USERNAME, demoModeOn } from '../../utils/demo.ts'
import { signIn, signInDemo } from '../../utils/session.ts'

// Checked when the username is unknown, so that case takes as long as a
// wrong password and the response does not reveal which names exist.
let decoyHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  // Over plain http at an address that is not this computer, the browser would
  // throw the login away and the page would come back as if nothing happened.
  // Say so instead, before a password is even looked at.
  const host = getRequestHeader(event, 'host')
  if (!loginCanStick(host, getRequestURL(event).protocol, getRequestHeader(event, 'x-forwarded-proto'))) {
    return fail(event, 400, `Logging in works over https, or at http://localhost on the computer Fotobogen runs on. You are using http://${host ?? 'this address'}, where your browser would not keep the login. On that computer, open http://localhost:${host?.match(/:(\d+)$/)?.[1] ?? '5150'} instead.`)
  }
  const key = limiterKey(event)
  const parsed = loginSchema.safeParse(await readBody(event).catch(() => null))

  // On a demo site, demo / demo lets anyone in to look, with no power to
  // change anything. It is handled here, before the limit on wrong
  // passwords, and never touches that limit: it neither counts as a failure
  // (many visitors may share one address) nor clears the count (or someone
  // guessing the owner's password could log in as demo between guesses to
  // start the count again). If the owner's own account is called "demo",
  // there is no demo login: the name belongs to the owner.
  if (demoModeOn() && parsed.success && parsed.data.username.trim() === DEMO_USERNAME && parsed.data.password === DEMO_PASSWORD
    && !getDb().select().from(users).where(eq(users.username, DEMO_USERNAME)).get()) {
    await signInDemo(event)
    return { ok: true, demo: true }
  }

  // Count the attempt before the slow password check, with no await between
  // the block check and the count. Otherwise a burst of simultaneous guesses
  // would all pass the check before any of them was counted.
  if (failureLimiter.isBlocked(key)) return tooManyAttempts(event, key)
  failureLimiter.recordFailure(key)

  const user = parsed.success
    ? getDb().select().from(users).where(eq(users.username, parsed.data.username.trim())).get()
    : undefined

  decoyHash ??= hashPassword('decoy password, never valid')
  const passwordOk = await verifyPassword(user?.passwordHash ?? await decoyHash, parsed.success ? parsed.data.password : '')

  if (!user || !passwordOk) return fail(event, 401, 'Wrong username or password.')

  failureLimiter.clear(key)
  getDb().update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id)).run()
  await signIn(event, user)
  return { ok: true }
})
