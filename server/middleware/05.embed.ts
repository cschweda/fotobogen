// The slideshow made to be shown inside other sites' pages lives at
// /embed/slideshow, the only page that allows framing by another site
// (nuxt.config.ts). Until the owner switches it on under Admin, Embed on
// another site, there is nothing there at all; and nothing else is ever
// served under /embed. What says so is a bare answer that cannot be framed.
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { isSetupComplete } from '../utils/app.ts'
import { embedEnabled } from '../utils/embed.ts'

export default defineEventHandler((event) => {
  // Lowercased because the page router matches paths without regard to case.
  const path = getRequestURL(event).pathname.toLowerCase().replace(/\/+$/, '')
  if (path !== '/embed' && !path.startsWith('/embed/')) return
  if (path === '/embed/slideshow' && isSetupComplete() && embedEnabled()) return
  return new Response('This slideshow is not available.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'' },
  })
})
