// The active skin's stylesheet, at a fixed address, so switching skins or
// changing an option needs no rebuild (DESIGN.md section 11). Pages link it
// with ?v=<version>, which changes when the stylesheet does.
import { defineEventHandler, getQuery } from 'nuxt/server'
import { activeSkin } from '../utils/skin.ts'

export default defineEventHandler((event) => {
  const { css, version } = activeSkin()
  event.res.headers.set('content-type', 'text/css; charset=utf-8')
  event.res.headers.set('x-content-type-options', 'nosniff')
  // With the right version in the address the file can be kept for good.
  event.res.headers.set('cache-control', getQuery(event).v === version ? 'public, max-age=31536000, immutable' : 'no-cache')
  return css
})
