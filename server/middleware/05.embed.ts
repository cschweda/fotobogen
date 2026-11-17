// The slideshow made to be shown inside other sites' pages lives at
// /embed/slideshow, the only page that allows framing by another site
// (nuxt.config.ts). Until the owner switches it on under Admin, Embed on
// another site, there is nothing there at all; and nothing else is ever
// served under /embed.
//
// Everything is decided here, before a page is made: the address must be
// spelled exactly, and an album or tag asked for must be one a visitor may
// see. Anything else gets a bare answer that cannot be framed, so the site's
// own error page, with its menu and links, never appears at an address whose
// rules allow framing. (Audit of 17 November 2026.)
import { defineEventHandler, getQuery, getRequestURL } from 'nuxt/server'
import { isSetupComplete } from '../utils/app.ts'
import { embedEnabled } from '../utils/embed.ts'
import { publicAlbum, publicTag } from '../utils/public.ts'

const refusal = () => new Response('This slideshow is not available.', {
  status: 404,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'' },
})

/** What the slideshow is asked to play, if it is something that exists and a visitor may see. */
function scopeIsShown(query: Record<string, unknown>): boolean {
  const { album, tag } = query
  if (album === undefined && tag === undefined) return true
  // One album or one tag, named once. A hidden album answers exactly as a missing one.
  if (album !== undefined && tag !== undefined) return false
  if (album !== undefined) return typeof album === 'string' && album !== '' && publicAlbum(album) !== null
  return typeof tag === 'string' && tag !== '' && publicTag(tag) !== null
}

export default defineEventHandler((event) => {
  // Lowercased to find everything under /embed, because the page router matches paths without regard to case.
  const path = getRequestURL(event).pathname
  const under = path.toLowerCase()
  if (under !== '/embed' && !under.startsWith('/embed/')) return
  // The address as it was sent, before any tidying: exactly this, or with one closing slash.
  const sent = ((event as unknown as { path?: string }).path ?? '').split(/[?#]/)[0]
  const exact = (sent === '/embed/slideshow' || sent === '/embed/slideshow/') && (path === '/embed/slideshow' || path === '/embed/slideshow/')
  if (!exact || !isSetupComplete() || !embedEnabled() || !scopeIsShown(getQuery(event))) return refusal()
  // Made afresh for every visit: switching it off takes effect at once, wherever it is embedded.
  event.res.headers.set('cache-control', 'no-store')
})
