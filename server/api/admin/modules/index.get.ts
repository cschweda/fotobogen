// The modules found at startup, with the transforms and parameters each one
// declares. The admin builds its controls from this, which is why adding a
// module needs no change to the admin itself.
import { defineEventHandler } from 'nuxt/server'
import { siteRecipe } from '../../../pipeline/render.ts'
import { getPipeline } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    // Applied to every photo that has no recipe of its own.
    siteRecipe: siteRecipe(getPipeline()),
    modules: getPipeline().modules!.list().map(module => ({
      name: module.manifest.name,
      label: module.manifest.label,
      version: module.manifest.version,
      description: module.manifest.description ?? null,
      source: module.source,
      enabled: module.enabled,
      error: module.error,
      transforms: module.transforms.map(transform => ({
        id: transform.id,
        label: transform.label,
        description: transform.description ?? null,
        params: transform.params,
      })),
    })),
  }
})
