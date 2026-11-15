// Change an album's name, description, address, visibility, or cover.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { updateAlbum } from '../../../pipeline/collections.ts'
import { getPipeline } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const result = updateAlbum(getPipeline(), getRouterParam(event, 'id') ?? '', await readBody<Record<string, unknown>>(event).catch(() => null) ?? {})
  if (result.ok) return result
  if (result.reason === 'not-found') return fail(event, 404, 'There is no such album.')
  return fail(event, result.reason === 'slug-taken' ? 409 : 422, 'Some fields need another look.', { errors: result.errors })
})
