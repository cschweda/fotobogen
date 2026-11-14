import { setResponseHeader, setResponseStatus, type H3Event } from 'h3'

/**
 * End a request with a status and a plain JSON body: `{ message, ...extra }`.
 * Pages read `message` (and `errors` for field-level problems) directly.
 */
export function fail(event: H3Event, status: number, message: string, extra: Record<string, unknown> = {}) {
  setResponseStatus(event, status)
  setResponseHeader(event, 'content-type', 'application/json')
  return { message, ...extra }
}
