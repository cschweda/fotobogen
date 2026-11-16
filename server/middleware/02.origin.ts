// A request that changes something must come from one of this site's own
// pages. Browsers always send Origin on such requests; anything without a
// matching one is refused (DESIGN.md section 6).
import { defineEventHandler, getRequestHeader, getRequestURL } from 'nuxt/server'
import { resolveSettings } from '../core/config.ts'
import { originMatchesHost } from '../core/request.ts'
import { fail } from '../utils/respond.ts'
import { bearerToken } from '../utils/tokens.ts'

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']

export default defineEventHandler((event) => {
  if (SAFE_METHODS.includes(event.req.method)) return
  // A request that presents an API token is not from a browser page, and is
  // judged by the token alone (its login cookie, if any, is ignored), so
  // there is no logged-in browser for another site to borrow. Tokens work
  // only on the admin's API, so only there does one stand in for the check.
  if (getRequestURL(event).pathname.toLowerCase().startsWith('/api/admin/') && bearerToken(getRequestHeader(event, 'authorization'))) return
  // Behind our own proxy the visitor's scheme is known; an https site is not changed from an http page.
  const secure = resolveSettings(process.env).trustProxy && getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() === 'https'
  if (!originMatchesHost(getRequestHeader(event, 'origin'), getRequestHeader(event, 'host'), secure)) {
    return fail(event, 403, 'This request did not come from this site.')
  }
})
