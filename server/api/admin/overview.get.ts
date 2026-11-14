// What the placeholder dashboard shows. Guarded by middleware/03.admin-guard.
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import { requireAdmin } from '../../utils/session.ts'
import { getSetting } from '../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  return {
    siteTitle: getSetting('site.title', ''),
    tagline: getSetting('site.tagline', ''),
    username: admin.username,
    version: String(useRuntimeConfig().appVersion),
  }
})
