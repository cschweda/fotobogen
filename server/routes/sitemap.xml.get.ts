// A sitemap of the home page and every public photo.
import { defineEventHandler } from 'nuxt/server'
import { escapeXml, recentPhotos, siteOrigin } from '../utils/public.ts'

export default defineEventHandler((event) => {
  const origin = siteOrigin(event)
  const urls = recentPhotos(50_000).map(photo =>
    `  <url><loc>${escapeXml(`${origin}/photo/${encodeURIComponent(photo.slug)}`)}</loc><lastmod>${new Date(photo.updatedAt).toISOString().slice(0, 10)}</lastmod></url>`)
  event.res.headers.set('content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(origin)}/</loc></url>
${urls.join('\n')}
</urlset>
`
})
