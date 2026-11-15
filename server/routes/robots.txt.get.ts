// Search engines may read the public pages; the admin is none of their business.
import { defineEventHandler } from 'nuxt/server'
import { siteOrigin } from '../utils/public.ts'
import { seoSettings } from '../utils/seo.ts'

export default defineEventHandler((event) => {
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  // The owner asked not to be listed: every well-behaved crawler is turned away.
  if (!seoSettings().indexing) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nDisallow: /admin\nDisallow: /login\nDisallow: /setup\nDisallow: /api/\n\nSitemap: ${siteOrigin(event)}/sitemap.xml\n`
})
