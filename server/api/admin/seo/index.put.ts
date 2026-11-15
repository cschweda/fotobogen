// Save the search and sharing settings.
import { defineEventHandler, readBody } from 'nuxt/server'
import { cleanSeo } from '../../../../shared/seo.ts'
import { fail } from '../../../utils/respond.ts'
import { SEO_KEY, sharingCard } from '../../../utils/seo.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { settings, errors } = cleanSeo(await readBody(event).catch(() => null))
  if (Object.keys(errors).length > 0) return fail(event, 422, 'Some of this needs another look.', { errors })
  setSettings({ [SEO_KEY]: settings })
  return { ok: true, settings, card: sharingCard(settings) }
})
