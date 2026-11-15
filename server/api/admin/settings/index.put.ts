// Save the site's settings. They take effect on the next page view.
import { defineEventHandler, readBody } from 'nuxt/server'
import { z } from 'zod'
import { DEFAULT_LICENCE, isLicence } from '../../../../shared/licences.ts'
import { fieldErrors, siteTitleSchema, taglineSchema } from '../../../../shared/schemas.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting, setSettings } from '../../../utils/settings.ts'
import { rerenderAll } from '../../../pipeline/render.ts'
import { getPipeline, getQueue } from '../../../utils/app.ts'
import { DEFAULT_QUALITY } from '../../../../shared/media.ts'

const schema = z.object({
  siteTitle: siteTitleSchema,
  tagline: taglineSchema,
  grid: z.enum(['masonry', 'square']),
  photoView: z.enum(['modal', 'page']),
  showExif: z.boolean(),
  showLocation: z.boolean(),
  newUploads: z.enum(['public', 'hidden']).default('public'),
  licence: z.string().refine(isLicence, 'Choose a licence from the list.').default(DEFAULT_LICENCE),
  allowDownload: z.boolean().default(false),
  slideshowSeconds: z.number('Give a number of seconds.').int('Use whole seconds.').min(3, 'At least 3 seconds, so each photo can be taken in.').max(120, 'At most 120 seconds.').default(8),
  slideshowOrder: z.enum(['sequence', 'random']).default('sequence'),
  photoQuality: z.enum(['smaller', 'standard', 'high'], 'Choose one of the three qualities.').optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) return fail(event, 422, 'Some settings need another look.', { errors: fieldErrors(parsed.error) })
  const settings = parsed.data
  setSettings({
    'site.title': settings.siteTitle,
    'site.tagline': settings.tagline,
    'layout.grid': settings.grid,
    'layout.photo_view': settings.photoView,
    'privacy.show_exif': settings.showExif,
    'privacy.show_location': settings.showLocation,
    'uploads.default_visibility': settings.newUploads,
    'site.license': settings.licence,
    'privacy.allow_original_download': settings.allowDownload,
    'slideshow.seconds': settings.slideshowSeconds,
    'slideshow.order': settings.slideshowOrder,
  })
  // A new quality applies to every photo, so every photo's copies are made again, in the background.
  let queued = 0
  if (settings.photoQuality && settings.photoQuality !== getSetting('media.quality', DEFAULT_QUALITY)) {
    setSettings({ 'media.quality': settings.photoQuality })
    queued = rerenderAll(getPipeline())
    getQueue().kick()
  }
  return { ok: true, queued }
})
