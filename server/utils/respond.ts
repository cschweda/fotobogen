import { setResponseStatus, type RequestEvent } from 'nuxt/server'

/**
 * End a request with a status and a plain JSON body: `{ message, ...extra }`.
 * Pages read `message` (and `errors` for field-level problems) directly.
 */
export function fail(event: RequestEvent, status: number, message: string, extra: Record<string, unknown> = {}) {
  setResponseStatus(event, status)
  event.res.headers.set('content-type', 'application/json')
  return { message, ...extra }
}
