// Wizard step 1: is this the token the server printed?
import { defineEventHandler, readBody } from 'nuxt/server'
import { loadOrCreateSetupToken, tokensMatch } from '../../core/setup-token.ts'
import { getPaths } from '../../utils/app.ts'
import { failureLimiter, limiterKey, tooManyAttempts } from '../../utils/limiter.ts'
import { fail } from '../../utils/respond.ts'

export default defineEventHandler(async (event) => {
  const key = limiterKey(event)
  const body = await readBody<{ token?: unknown }>(event).catch(() => null)
  const given = typeof body?.token === 'string' ? body.token.trim() : ''

  // No await between the block check and counting a failure, so attempts
  // made at the same moment are all counted.
  if (failureLimiter.isBlocked(key)) return tooManyAttempts(event, key)
  if (!tokensMatch(given, loadOrCreateSetupToken(getPaths().setupToken))) {
    failureLimiter.recordFailure(key)
    return fail(event, 401, 'That setup token is not correct. Copy it from the server log and try again.')
  }
  return { ok: true }
})
