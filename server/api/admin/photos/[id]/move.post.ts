// Change a photo's place in the order: { "to": "up" | "down" | "top" | "bottom" },
// or { "before": "<id>" } to put it in front of another photo ({ "before": null } for last).
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { movePhoto, placePhoto } from '../../../../pipeline/library.ts'
import { trashedAmong } from '../../../../pipeline/remove.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  // A photo in the trash keeps its place; nothing is moved in front of or behind it either.
  if (trashedAmong(getPipeline(), [id]).length > 0) return fail(event, 404, 'That photo is in the trash. Restore it to move it.')
  const body = await readBody<{ to?: unknown, before?: unknown }>(event).catch(() => null)
  let moved: boolean
  if (body?.to === 'up' || body?.to === 'down' || body?.to === 'top' || body?.to === 'bottom') moved = movePhoto(getPipeline(), id, body.to)
  else if (body && 'before' in body && (body.before === null || typeof body.before === 'string')) moved = placePhoto(getPipeline(), id, body.before)
  else return fail(event, 422, 'Send { "to": "up" }, "down", "top", or "bottom", or { "before": "<photo id>" }.')
  if (!moved) return fail(event, 404, 'There is no such photo.')
  return { ok: true }
})
