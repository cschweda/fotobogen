// One action on several photos: { "ids": [...], "action": "hide" | "show" | "delete" }.
import { defineEventHandler, readBody } from 'nuxt/server'
import { setVisibility } from '../../../pipeline/library.ts'
import { deletePhotos } from '../../../pipeline/remove.ts'
import { getPipeline } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

const MAX_IDS = 500

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ ids?: unknown, action?: unknown }>(event).catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, MAX_IDS) : []
  if (ids.length === 0) return fail(event, 422, 'Choose at least one photo.')
  const ctx = getPipeline()
  if (body?.action === 'hide') return { changed: setVisibility(ctx, ids, 'hidden') }
  if (body?.action === 'show') return { changed: setVisibility(ctx, ids, 'public') }
  if (body?.action === 'delete') return { changed: (await deletePhotos(ctx, { ids })).count }
  return fail(event, 422, 'The action must be "hide", "show", or "delete".')
})
