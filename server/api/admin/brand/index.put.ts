// How tall the logo is shown.
import { defineEventHandler, readBody } from 'nuxt/server'
import { publicBrand, setLogoHeight } from '../../../utils/brand.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ logoHeight?: unknown }>(event).catch(() => null)
  return { meta: setLogoHeight(body?.logoHeight), shown: publicBrand() }
})
