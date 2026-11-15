// Serves resized photos. A proxy in front (Caddy, nginx) normally serves
// these files straight from disk; this route is what makes that optional
// (DESIGN.md section 14.1). File names contain a hash of their contents,
// so they can be cached forever.
//
// Each file is read whole and sent in one piece. Resized copies are small
// (the largest is about a megabyte), and a file read to the end and closed
// cannot stall half-way the way an open stream can.
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { isStorageKey } from '../../storage/local.ts'
import { getPipeline } from '../../utils/app.ts'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') ?? ''
  // Only derivative file names; this is also what stops path traversal.
  const file = isStorageKey(name) && name.endsWith('.webp') ? await getPipeline().storage.read('derivatives', name) : null
  if (!file) throw createError({ status: 404, statusText: 'Not Found' })

  return new Response(new Uint8Array(file), {
    headers: {
      'content-type': 'image/webp',
      'content-length': String(file.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
})
