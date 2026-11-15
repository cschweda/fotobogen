// One photo, for the edit screen: its details, its recipe, and its medium copy.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { siteRecipe } from '../../../../pipeline/render.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { sqlite, storage, modules } = getPipeline()
  const photo = sqlite.prepare(`
    select p.id, p.slug, p.title, p.original_filename as filename, p.status, p.width, p.height, p.recipe_json as recipe,
      d.path, d.width as mediumWidth, d.height as mediumHeight
    from photos p left join derivatives d on d.photo_id = p.id and d.kind = 'medium'
    where p.id = ?
  `).get(getRouterParam(event, 'id') ?? '') as {
    id: string, slug: string, title: string | null, filename: string, status: string, width: number, height: number
    recipe: string | null, path: string | null, mediumWidth: number | null, mediumHeight: number | null
  } | undefined
  if (!photo) return fail(event, 404, 'There is no such photo.')

  const own = photo.recipe === null ? null : modules!.cleanRecipe(JSON.parse(photo.recipe))
  const site = siteRecipe(getPipeline())
  const recipe = own ?? site
  return {
    id: photo.id,
    slug: photo.slug,
    title: photo.title,
    filename: photo.filename,
    status: photo.status,
    width: photo.width,
    height: photo.height,
    // The photo's own recipe; null when it follows the site-wide one.
    own,
    site,
    // What is actually applied.
    recipe,
    // Steps whose module is switched off or missing; they are skipped when rendering.
    skipped: modules!.skipped(recipe).map(step => `${step.module}/${step.transform}`),
    medium: photo.path ? { url: storage.publicUrl(photo.path), width: photo.mediumWidth!, height: photo.mediumHeight! } : null,
  }
})
