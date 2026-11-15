// The site's icon and logo, for the admin page that sets them.
import { defineEventHandler } from 'nuxt/server'
import { BRAND_MAX_BYTES, brandMeta, LOGO_HEIGHT, publicBrand } from '../../../utils/brand.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { meta: brandMeta(), shown: publicBrand(), limits: { maxBytes: BRAND_MAX_BYTES, logoHeight: LOGO_HEIGHT } }
})
