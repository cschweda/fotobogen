// Serves resized photos. A proxy in front (Caddy, nginx) normally serves
// these files straight from disk; this route is what makes that optional
// (DESIGN.md section 14.1). File names contain a hash of their contents,
// so they can be cached forever.
import { Readable } from 'node:stream'
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { isStorageKey } from '../../storage/local.ts'
import { getPipeline } from '../../utils/app.ts'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') ?? ''
  const { storage } = getPipeline()
  // Only derivative file names; this is also what stops path traversal.
  const size = isStorageKey(name) && name.endsWith('.webp') ? await storage.size('derivatives', name) : null
  if (size === null) throw createError({ status: 404, statusText: 'Not Found' })

  return new Response(Readable.toWeb(storage.get('derivatives', name) as Readable) as ReadableStream, {
    headers: {
      'content-type': 'image/webp',
      'content-length': String(size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
})
