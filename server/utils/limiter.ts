// One failure limiter shared by login and setup-token attempts:
// 5 failures per 15 minutes per address (DESIGN.md section 6).
import { getRequestHeader, getRequestIP, type RequestEvent } from 'nuxt/server'
import { config, resolveSettings } from '../core/config.ts'
import { createFailureLimiter } from '../core/rate-limit.ts'
import { clientIpFrom, rateLimitKey } from '../core/request.ts'
import { fail } from './respond.ts'

const { maxFailures, failureWindowMinutes } = config.internals.auth
export const failureLimiter = createFailureLimiter({ max: maxFailures, windowMs: failureWindowMinutes * 60_000 })

/** The key failures are counted against for this request's visitor. */
export function limiterKey(event: RequestEvent): string {
  const { trustProxy } = resolveSettings(process.env)
  const ip = clientIpFrom(getRequestIP(event), getRequestHeader(event, 'x-forwarded-for'), trustProxy)
  return rateLimitKey(ip)
}

/** The 429 response for a blocked visitor. */
export function tooManyAttempts(event: RequestEvent, key: string) {
  const seconds = failureLimiter.retryAfterSeconds(key)
  event.res.headers.set('retry-after', String(seconds))
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return fail(event, 429, `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`)
}
