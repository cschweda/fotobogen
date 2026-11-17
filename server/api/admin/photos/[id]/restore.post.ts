// Take one photo back out of the trash. It is made again from the file that
// was uploaded and returns to the site as it was: same address, albums, and tags.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { restorePhotos } from '../../../../pipeline/remove.ts'
import { getPipeline, getQueue } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const ctx = getPipeline()
  if (restorePhotos(ctx, [id]) === 0) {
    const exists = ctx.sqlite.prepare(`select 1 from photos where id = ?`).get(id) !== undefined
    return exists ? fail(event, 409, 'That photo is not in the trash.') : fail(event, 404, 'There is no such photo.')
  }
  getQueue().kick()
  return { restored: 1 }
})
