// The search and sharing settings as stored, and what the public pages need of them.
import { cleanSeo, SEO_DEFAULTS, type SeoSettings } from '../../shared/seo.ts'
import { publicPhoto, publicTiles } from './public.ts'
import { getSetting } from './settings.ts'

export const SEO_KEY = 'seo.settings'

export function seoSettings(): SeoSettings {
  // Read through the same checks as when saving, so a hand-edited database cannot put anything odd on a page.
  return { ...SEO_DEFAULTS, ...cleanSeo(getSetting<unknown>(SEO_KEY, {})).settings }
}

/** The picture used when the site, or a page with no picture of its own, is shared. */
export function sharingCard(seo = seoSettings()): { url: string, width: number, height: number, alt: string } | null {
  if (seo.cardPhoto === 'none') return null
  // The chosen photo if it is still public; otherwise, and by default, the newest one.
  const slug = (seo.cardPhoto && publicPhoto(seo.cardPhoto) ? seo.cardPhoto : undefined) ?? publicTiles(1).tiles[0]?.slug
  const photo = slug ? publicPhoto(slug) : null
  const image = photo?.images[0]
  return image ? { url: image.url, width: image.width, height: image.height, alt: photo!.alt || photo!.title || '' } : null
}
