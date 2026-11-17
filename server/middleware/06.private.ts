// Private albums live at /private/<token>, a link that cannot be guessed.
// Whoever has the link sees the album, so everything served under it is
// marked: never to be kept by a browser or a proxy, never to be listed by a
// search engine. (The site already tells browsers to send no referrer, so
// the link is not passed on to other sites; and no counting script is put on
// these pages: server/utils/stats.ts.)
import { defineEventHandler, getRequestURL } from 'nuxt/server'

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname.toLowerCase()
  if (!/^\/(api\/)?private(\/|$)/.test(path)) return
  event.res.headers.set('cache-control', 'private, no-store')
  event.res.headers.set('x-robots-tag', 'noindex, nofollow')
})
