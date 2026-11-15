// Browsers ask for /favicon.ico whatever the page says. Answer with the
// owner's icon if there is one. (It is a PNG; every current browser accepts
// that at this address.)
import { defineEventHandler } from 'nuxt/server'
import { brandFile } from '../utils/brand.ts'

export default defineEventHandler(() => {
  const file = brandFile('icon-32.png')
  if (!file) return new Response(null, { status: 204, headers: { 'cache-control': 'no-cache' } })
  return new Response(new Uint8Array(file), { headers: { 'content-type': 'image/png', 'content-length': String(file.length), 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } })
})
