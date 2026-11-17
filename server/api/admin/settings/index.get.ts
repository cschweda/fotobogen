// The site's settings, for the admin's settings page.
import { defineEventHandler } from 'nuxt/server'
import { DEFAULT_LICENCE } from '../../../../shared/licences.ts'
import { DEFAULT_QUALITY, isQualityPreset, type QualityPreset } from '../../../../shared/media.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    siteTitle: getSetting('site.title', ''),
    tagline: getSetting('site.tagline', ''),
    grid: getSetting<'masonry' | 'square'>('layout.grid', 'masonry'),
    // The front page: the library's order, or dealt afresh for each visit.
    homeOrder: getSetting<'sequence' | 'random'>('layout.home_order', 'random'),
    photoView: getSetting<'modal' | 'page'>('layout.photo_view', 'modal'),
    showExif: getSetting('privacy.show_exif', true),
    showLocation: getSetting('privacy.show_location', false),
    // Whether a new upload is public at once or starts hidden, as a draft.
    // The licence photos are published under unless a photo says otherwise, and whether visitors may download them.
    licence: getSetting('site.license', DEFAULT_LICENCE),
    allowDownload: getSetting('privacy.allow_original_download', false),
    newUploads: getSetting<'public' | 'hidden'>('uploads.default_visibility', 'public'),
    // How hard the copies made for the web are compressed: smaller, standard, or high.
    photoQuality: isQualityPreset(getSetting<unknown>('media.quality', DEFAULT_QUALITY)) ? getSetting<QualityPreset>('media.quality', DEFAULT_QUALITY) : DEFAULT_QUALITY,
    // The slideshow: seconds each photo is shown, and whether the order is yours or shuffled.
    slideshowSeconds: getSetting('slideshow.seconds', 8),
    slideshowOrder: getSetting<'sequence' | 'random'>('slideshow.order', 'sequence'),
  }
})
