// Delete one photo. It goes to the trash: off the site at once, and kept for
// thirty days. With ?forever=1, a photo that is already in the trash is
// deleted for good: its record, the file that was uploaded, and every
// resized copy.
import { defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'
import { deletePhotos, trashedAmong, trashPhotos } from '../../../../pipeline/remove.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { beforeDelete, photosDeleted } from '../../../../utils/photo-events.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const ctx = getPipeline()
  const inTrash = trashedAmong(ctx, [id]).length === 1

  if (String(getQuery(event).forever ?? '') === '1') {
    if (!inTrash) {
      const exists = ctx.sqlite.prepare(`select 1 from photos where id = ?`).get(id) !== undefined
      return exists ? fail(event, 409, 'Only a photo in the trash can be deleted for good. Move it to the trash first.') : fail(event, 404, 'There is no such photo.')
    }
    const { count } = await deletePhotos(ctx, { ids: [id] })
    return { deleted: count }
  }

  // Webhooks are told when a photo leaves the site, which is now.
  const gone = inTrash ? [] : beforeDelete([id])
  if (trashPhotos(ctx, [id]) === 0) return fail(event, 404, inTrash ? 'That photo is already in the trash.' : 'There is no such photo.')
  photosDeleted(gone)
  return { trashed: 1 }
})
