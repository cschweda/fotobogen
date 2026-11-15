// The public facts about the site, for the public pages.
import { defineEventHandler } from 'nuxt/server'
import { publicAlbums } from '../utils/public.ts'
import { getSetting } from '../utils/settings.ts'
import { activeSkin } from '../utils/skin.ts'

export default defineEventHandler(() => ({
  title: getSetting('site.title', ''),
  tagline: getSetting('site.tagline', ''),
  grid: getSetting<'masonry' | 'square'>('layout.grid', 'masonry'),
  photoView: getSetting<'modal' | 'page'>('layout.photo_view', 'modal'),
  // Changes whenever the skin or its options change, so browsers refetch the stylesheet.
  skinVersion: activeSkin().version,
  // Whether to offer visitors a link to the albums.
  hasAlbums: publicAlbums().length > 0,
}))
