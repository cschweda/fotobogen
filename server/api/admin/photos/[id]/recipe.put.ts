// Save a photo's own recipe (its list of transforms) and render it again.
// { "recipe": [...] } sets it; { "recipe": [] } means no transforms for this
// photo; { "recipe": null } means follow the site-wide recipe. The original
// file is never changed.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { setRecipe } from '../../../../pipeline/render.ts'
import { getPipeline, getQueue } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ recipe?: unknown }>(event).catch(() => null)
  if (body?.recipe !== null && !Array.isArray(body?.recipe)) return fail(event, 422, 'Send { "recipe": [...] }, or { "recipe": null } to follow the site-wide setting.')
  const saved = setRecipe(getPipeline(), getRouterParam(event, 'id') ?? '', body.recipe)
  if (!saved) return fail(event, 409, 'This photo cannot be changed right now. It may still be processing, or it no longer exists.')
  getQueue().kick()
  return saved
})
