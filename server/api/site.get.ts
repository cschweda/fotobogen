// The public facts about the site, for the public pages.
import { publicBrand } from '../utils/brand.ts'
import { resolveSettings } from '../core/config.ts'
import { defineEventHandler } from 'nuxt/server'
import { siteMenu } from '../utils/pages.ts'
import { publicAlbums } from '../utils/public.ts'
import { getSetting } from '../utils/settings.ts'
import { cleanLanguage, cleanText } from '../../shared/site-text.ts'
import { seoSettings, sharingCard } from '../utils/seo.ts'
import { activeSkin } from '../utils/skin.ts'

export default defineEventHandler(() => {
  const seo = seoSettings()
  return {
  title: getSetting('site.title', ''),
  tagline: getSetting('site.tagline', ''),
  grid: getSetting<'masonry' | 'square'>('layout.grid', 'masonry'),
  photoView: getSetting<'modal' | 'page'>('layout.photo_view', 'modal'),
  // Changes whenever the skin or its options change, so browsers refetch the stylesheet.
  skinVersion: activeSkin().version,
  // The mode a visitor sees first: 'light', 'dark', or 'auto' (their device's setting).
  mode: activeSkin().mode,
  // Whether to offer visitors a link to the albums.
  hasAlbums: publicAlbums().length > 0,
  // What the owner added to the menu: their pages, then their own links.
  menu: siteMenu(),
  // The owner's icon and logo, if they uploaded any.
  brand: publicBrand(),
  // The language the site's words are in, for the page's lang attribute.
  language: cleanLanguage(getSetting('site.language', 'en')),
  // The owner's replacements for the fixed text on the pages. Empty means all defaults.
  text: cleanText(getSetting<unknown>('site.text', {})),
  // What search engines and social networks are told.
  seo: {
    homeTitle: seo.homeTitle,
    titlePattern: seo.titlePattern,
    description: seo.description,
    indexing: seo.indexing,
    // The address set on the server (SITE_URL) wins over the one set in the admin.
    siteUrl: resolveSettings(process.env).siteUrl || seo.siteUrl,
    author: seo.author,
    twitter: seo.twitter,
    googleVerification: seo.googleVerification,
    bingVerification: seo.bingVerification,
    card: sharingCard(seo),
  },
  }
})
