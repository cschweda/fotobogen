// Create an album: { "title": "...", "description": "..." }.
import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server'
import { createAlbum } from '../../../pipeline/collections.ts'
import { getPipeline } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const result = createAlbum(getPipeline(), await readBody<Record<string, unknown>>(event).catch(() => null) ?? {})
  if (!result.ok) return fail(event, 422, 'The album could not be created.', { errors: result.errors })
  setResponseStatus(event, 201)
  return result
})
