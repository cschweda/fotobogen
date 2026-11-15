// Download a photo, when its owner allows that. Normally the file exactly
// as uploaded; if that file records where it was taken and the site keeps
// locations private, the largest resized copy instead (see public.ts).
import { Readable } from 'node:stream'
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { getPipeline } from '../../../utils/app.ts'
import { publicDownload } from '../../../utils/public.ts'

export default defineEventHandler(async (event) => {
  const file = publicDownload(getRouterParam(event, 'slug') ?? '')
  const { storage } = getPipeline()
  const size = file ? await storage.size(file.area, file.key) : null
  if (!file || size === null) throw createError({ status: 404, statusText: 'Not Found' })
  // The name is the uploader's own; keep it to plain characters in the header.
  const name = file.filename.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'photo'
  return new Response(Readable.toWeb(storage.get(file.area, file.key) as Readable) as ReadableStream, {
    headers: {
      'content-type': file.mime,
      'content-length': String(size),
      'content-disposition': `attachment; filename="${name}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
})
