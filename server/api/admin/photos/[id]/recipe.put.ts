// Save a photo's recipe (its list of transforms) and render it again.
// The original file is never changed; an empty recipe restores the photo.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { setRecipe } from '../../../../pipeline/render.ts'
import { getPipeline, getQueue } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ recipe?: unknown }>(event).catch(() => null)
  if (!Array.isArray(body?.recipe)) return fail(event, 422, 'Send { "recipe": [...] }.')
  const recipe = setRecipe(getPipeline(), getRouterParam(event, 'id') ?? '', body.recipe)
  if (!recipe) return fail(event, 409, 'This photo cannot be changed right now. It may still be processing, or it no longer exists.')
  getQueue().kick()
  return { recipe }
})
