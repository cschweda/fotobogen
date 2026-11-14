import { eq } from 'drizzle-orm'
import { defineEventHandler, readBody } from 'nuxt/server'
import { loginSchema } from '../../../shared/schemas.ts'
import { hashPassword, verifyPassword } from '../../core/password.ts'
import { users } from '../../db/schema.ts'
import { getDb } from '../../utils/app.ts'
import { failureLimiter, limiterKey, tooManyAttempts } from '../../utils/limiter.ts'
import { fail } from '../../utils/respond.ts'
import { signIn } from '../../utils/session.ts'

// Checked when the username is unknown, so that case takes as long as a
// wrong password and the response does not reveal which names exist.
let decoyHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  const key = limiterKey(event)
  const parsed = loginSchema.safeParse(await readBody(event).catch(() => null))

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
