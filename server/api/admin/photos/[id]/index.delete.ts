// Delete one photo: its record, the file that was uploaded, and every resized copy.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { deletePhotos } from '../../../../pipeline/remove.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { beforeDelete, photosDeleted } from '../../../../utils/photo-events.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const gone = beforeDelete([id])
  const { count } = await deletePhotos(getPipeline(), { ids: [id] })
  if (count === 0) return fail(event, 404, 'There is no such photo.')
  photosDeleted(gone)
  return { deleted: count }
})
