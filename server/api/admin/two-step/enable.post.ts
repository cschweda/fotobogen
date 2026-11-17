// Switches two-step login on, once a code shows that a phone holds the key.
// Answers the backup codes, and signs out every other browser.
import { defineEventHandler, readBody } from 'nuxt/server'
import { failureLimiter, limiterKey, tooManyAttempts } from '../../../utils/limiter.ts'
import { fail } from '../../../utils/respond.ts'
import { signIn } from '../../../utils/session.ts'
import { enableTwoStep, requireOwner } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  if (user.totpSecret) return fail(event, 409, 'Two-step login is already on.')
  const body = await readBody(event).catch(() => null) as { code?: unknown } | null
  const key = limiterKey(event)
  if (failureLimiter.isBlocked(key)) return tooManyAttempts(event, key)
  const codes = typeof body?.code === 'string' ? enableTwoStep(user, body.code.slice(0, 40)) : null
  if (!codes) {
    failureLimiter.recordFailure(key)
    return fail(event, 422, 'That code is not right. Enter the six digits your authenticator app shows now for this entry. If it keeps failing, check that the clock on your phone is right.')
  }
  await signIn(event, { id: user.id, sessionVersion: user.sessionVersion + 1 })
  return { ok: true, codes }
})
