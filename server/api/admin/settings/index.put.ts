// Save the site's settings. They take effect on the next page view.
import { defineEventHandler, readBody } from 'nuxt/server'
import { z } from 'zod'
import { fieldErrors, siteTitleSchema, taglineSchema } from '../../../../shared/schemas.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'

const schema = z.object({
  siteTitle: siteTitleSchema,
  tagline: taglineSchema,
  grid: z.enum(['masonry', 'square']),
  photoView: z.enum(['modal', 'page']),
  showExif: z.boolean(),
  showLocation: z.boolean(),
  newUploads: z.enum(['public', 'hidden']).default('public'),
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
  })
  return { ok: true }
})
