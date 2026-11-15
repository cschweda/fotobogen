// The site's icon and logo, as uploaded under Admin, Icon and logo.
// Public, like the photos: they appear on every public page.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'
import { brandFile, brandMeta } from '../../utils/brand.ts'

export default defineEventHandler((event) => {
  const file = brandFile(getRouterParam(event, 'name') ?? '')
  if (!file) throw createError({ status: 404, statusText: 'Not Found' })
  return new Response(new Uint8Array(file), {
    headers: {
      'content-type': 'image/png',
      'content-length': String(file.length),
      // With the current version in the address, the picture can be kept for good.
      'cache-control': getQuery(event).v === brandMeta().version ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    },
  })
})
