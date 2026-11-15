// The public facts about the site, for the public pages.
import { defineEventHandler } from 'nuxt/server'
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
    siteUrl: seo.siteUrl,
    author: seo.author,
    twitter: seo.twitter,
    googleVerification: seo.googleVerification,
    bingVerification: seo.bingVerification,
    card: sharingCard(seo),
  },
  }
})
