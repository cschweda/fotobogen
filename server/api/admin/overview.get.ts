// What the dashboard shows. Guarded by middleware/03.admin-guard.
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import { getSqlite } from '../../utils/app.ts'
import { requireAdmin } from '../../utils/session.ts'
import { getSetting } from '../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const photos = getSqlite().prepare(`
    select count(*) as total, coalesce(sum(status = 'processing'), 0) as processing, coalesce(sum(status = 'failed'), 0) as failed
    from photos
  `).get() as { total: number, processing: number, failed: number }
  return {
    siteTitle: getSetting('site.title', ''),
    tagline: getSetting('site.tagline', ''),
    username: admin.username,
    version: String(useRuntimeConfig().appVersion),
    photos,
  }
})
