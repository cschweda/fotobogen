// Delete an album. The photos in it stay in the library.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { deleteAlbum } from '../../../pipeline/collections.ts'
import { getPipeline } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!deleteAlbum(getPipeline(), getRouterParam(event, 'id') ?? '')) return fail(event, 404, 'There is no such album.')
  return { ok: true }
})
