// The site-wide recipe: transforms applied to every photo that does not
// have a recipe of its own. Saving it renders those photos again.
import { defineEventHandler, readBody } from 'nuxt/server'
import { setSiteRecipe } from '../../pipeline/render.ts'
import { getPipeline, getQueue } from '../../utils/app.ts'
import { fail } from '../../utils/respond.ts'
import { requireAdmin } from '../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ recipe?: unknown }>(event).catch(() => null)
  if (!Array.isArray(body?.recipe)) return fail(event, 422, 'Send { "recipe": [...] }. An empty list switches the site-wide transforms off.')
  const saved = setSiteRecipe(getPipeline(), body.recipe)
  getQueue().kick()
  return saved
})
