// An RSS feed of the newest public photos.
import { defineEventHandler } from 'nuxt/server'
import { escapeXml, recentPhotos, siteOrigin } from '../utils/public.ts'
import { cleanText, siteText, UNNAMED_SITE } from '../../shared/site-text.ts'
import { seoSettings } from '../utils/seo.ts'
import { getSetting } from '../utils/settings.ts'

export default defineEventHandler((event) => {
  const origin = siteOrigin(event)
  const title = getSetting('site.title', '') || UNNAMED_SITE
  const text = cleanText(getSetting<unknown>('site.text', {}))
  const items = recentPhotos(30).map((photo) => {
    const link = `${origin}/photo/${encodeURIComponent(photo.slug)}`
    const picture = photo.image ? `<p><img src="${escapeXml(origin + photo.image)}" alt=""></p>` : ''
    const words = photo.description ? `<p>${escapeXml(photo.description)}</p>` : ''
    return `    <item>
      <title>${escapeXml(photo.title ?? siteText(text, 'untitled'))}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(photo.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(picture + words)}</description>
    </item>`
  })
  event.res.headers.set('content-type', 'application/rss+xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(origin)}/</link>
    <description>${escapeXml(seoSettings().description || getSetting('site.tagline', '') || title)}</description>
    <atom:link href="${escapeXml(origin)}/feed.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`
})
