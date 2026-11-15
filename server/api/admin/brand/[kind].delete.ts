// Remove the site's icon or one of its logos. The site goes back to showing its name as text, or to no icon.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { BRAND_KINDS, type BrandKind, publicBrand, removeBrandImage } from '../../../utils/brand.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const kind = getRouterParam(event, 'kind') as BrandKind
  if (!BRAND_KINDS.includes(kind)) return fail(event, 404, 'There is no such picture to remove.')
  return { meta: removeBrandImage(kind), shown: publicBrand() }
})
