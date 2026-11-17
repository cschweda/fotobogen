// One action on several photos: { "ids": [...], "action": ... }.
//   "hide" | "show"
//   "delete" (to the trash) | "restore" (from it) | "delete-forever" (only what is in the trash)
//   "add-to-album" | "remove-from-album", with "album": "<album id>"
//   "add-tag", with "tag": "<name>"
import { defineEventHandler, readBody } from 'nuxt/server'
import { addTag, addToAlbum, removeFromAlbum } from '../../../pipeline/collections.ts'
import { setVisibility } from '../../../pipeline/library.ts'
import { deletePhotos, restorePhotos, trashedAmong, trashPhotos } from '../../../pipeline/remove.ts'
import { getPipeline, getQueue } from '../../../utils/app.ts'
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
  // Photos in the trash are left exactly as they were: only the three trash actions touch them.
  if (body?.action !== 'delete' && body?.action !== 'restore' && body?.action !== 'delete-forever') {
    const inTrash = new Set(trashedAmong(ctx, ids))
    if (inTrash.size > 0) ids.splice(0, ids.length, ...ids.filter(id => !inTrash.has(id)))
    if (ids.length === 0) return { changed: 0 }
  }
  if (body?.action === 'hide') return { changed: setVisibility(ctx, ids, 'hidden') }
  if (body?.action === 'show') {
    const hidden = ids.filter(id => !isLive(id))
    const changed = setVisibility(ctx, ids, 'public')
    for (const id of hidden) photoPublished(id)
    return { changed }
  }
  if (body?.action === 'delete') {
    // To the trash. Webhooks are told now, when the photos leave the site.
    const already = new Set(trashedAmong(ctx, ids))
    const gone = beforeDelete(ids.filter(id => !already.has(id)))
    const changed = trashPhotos(ctx, ids)
    photosDeleted(gone)
    return { changed }
  }
  if (body?.action === 'restore') {
    const changed = restorePhotos(ctx, ids)
    if (changed > 0) getQueue().kick()
    return { changed }
  }
  if (body?.action === 'delete-forever') {
    // Only what is in the trash: nothing is deleted for good in one step.
    const { count } = await deletePhotos(ctx, { ids: trashedAmong(ctx, ids) })
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
