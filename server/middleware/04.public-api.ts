// The public, read-only API (docs/API.md): the same data the public pages
// are made from. It carries no login and nothing private, so any site may
// read it from a browser; these headers say so.
import { defineEventHandler, getRequestURL } from 'nuxt/server'

const PUBLIC = /^\/api\/(photos|albums|tags|slideshow|site|pages)(\/|$)/

export default defineEventHandler((event) => {
  if (!PUBLIC.test(getRequestURL(event).pathname.toLowerCase())) return
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD' && event.req.method !== 'OPTIONS') return
  event.res.headers.set('access-control-allow-origin', '*')
  event.res.headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
  // The version of the API's shape. It changes only when a field is removed or changes meaning.
  event.res.headers.set('x-fotobogen-api', '1')
  if (event.req.method === 'OPTIONS') {
    event.res.headers.set('access-control-max-age', '86400')
    return new Response(null, { status: 204, headers: event.res.headers })
  }
})
