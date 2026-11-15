// Search and sharing settings, with what is needed to preview them.
import { resolveSettings } from '../../../core/config.ts'
import { defineEventHandler } from 'nuxt/server'
import { TITLE_PATTERNS } from '../../../../shared/seo.ts'
import { getPipeline } from '../../../utils/app.ts'
import { siteOrigin } from '../../../utils/public.ts'
import { seoSettings, sharingCard } from '../../../utils/seo.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const settings = seoSettings()
  // Public photos, newest first, to choose the sharing picture from.
  const photos = getPipeline().sqlite.prepare(`
    select slug, title from photos
    where status = 'ready' and visibility = 'public' and (publish_at is null or publish_at <= ?)
    order by sort_order limit 200
  `).all(Date.now()) as { slug: string, title: string | null }[]
  return {
    settings,
    patterns: TITLE_PATTERNS,
    photos,
    // Set on the server with SITE_URL: it is used whatever the field here says.
    serverSiteUrl: resolveSettings(process.env).siteUrl,
    preview: { siteTitle: getSetting('site.title', ''), tagline: getSetting('site.tagline', ''), origin: siteOrigin(event), card: sharingCard(settings) },
  }
})
