// The site's settings, for the admin's settings page.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    siteTitle: getSetting('site.title', ''),
    tagline: getSetting('site.tagline', ''),
    grid: getSetting<'masonry' | 'square'>('layout.grid', 'masonry'),
    photoView: getSetting<'modal' | 'page'>('layout.photo_view', 'modal'),
    showExif: getSetting('privacy.show_exif', true),
    showLocation: getSetting('privacy.show_location', false),
    // Whether a new upload is public at once or starts hidden, as a draft.
    newUploads: getSetting<'public' | 'hidden'>('uploads.default_visibility', 'public'),
  }
})
