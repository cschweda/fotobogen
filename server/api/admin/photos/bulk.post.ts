// One action on several photos: { "ids": [...], "action": ... }.
//   "hide" | "show" | "delete"
//   "add-to-album" | "remove-from-album", with "album": "<album id>"
//   "add-tag", with "tag": "<name>"
import { defineEventHandler, readBody } from 'nuxt/server'
import { addTag, addToAlbum, removeFromAlbum } from '../../../pipeline/collections.ts'
import { setVisibility } from '../../../pipeline/library.ts'
import { deletePhotos } from '../../../pipeline/remove.ts'
import { getPipeline } from '../../../utils/app.ts'
import { beforeDelete, isLive, photoPublished, photosDeleted } from '../../../utils/photo-events.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

const MAX_IDS = 500

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ ids?: unknown, action?: unknown, album?: unknown, tag?: unknown }>(event).catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, MAX_IDS) : []
  if (ids.length === 0) return fail(event, 422, 'Choose at least one photo.')
  const ctx = getPipeline()
  if (body?.action === 'hide') return { changed: setVisibility(ctx, ids, 'hidden') }
  if (body?.action === 'show') {
    const hidden = ids.filter(id => !isLive(id))
    const changed = setVisibility(ctx, ids, 'public')
    for (const id of hidden) photoPublished(id)
    return { changed }
  }
  if (body?.action === 'delete') {
    const gone = beforeDelete(ids)
    const { count } = await deletePhotos(ctx, { ids })
    photosDeleted(gone)
    return { changed: count }
  }
  if (body?.action === 'add-to-album' || body?.action === 'remove-from-album') {
    const album = typeof body.album === 'string' ? body.album : ''
    const changed = body.action === 'add-to-album' ? addToAlbum(ctx, album, ids) : removeFromAlbum(ctx, album, ids)
    if (changed === null) return fail(event, 404, 'There is no such album.')
    return { changed }
  }
  if (body?.action === 'add-tag') {
    const changed = addTag(ctx, ids, body.tag)
    if (changed === null) return fail(event, 422, 'Type a tag: a word or two, with at least one letter or number.')
    return { changed }
  }
  return fail(event, 422, 'That is not an action this can do.')
})
