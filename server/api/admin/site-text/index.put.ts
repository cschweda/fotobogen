// Save the site's own words. They show on the next page view.
import { defineEventHandler, readBody } from 'nuxt/server'
import { z } from 'zod'
import { fieldErrors, siteTitleSchema, taglineSchema } from '../../../../shared/schemas.ts'
import { cleanText, LANGUAGE_PATTERN } from '../../../../shared/site-text.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'

const schema = z.object({
  siteTitle: siteTitleSchema,
  tagline: taglineSchema,
  language: z.string().trim().regex(LANGUAGE_PATTERN, 'Use a language code such as en, de, or pt-BR.').default('en'),
  text: z.record(z.string(), z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) return fail(event, 422, 'Some of this needs another look.', { errors: fieldErrors(parsed.error) })
  const text = cleanText(parsed.data.text)
  setSettings({ 'site.title': parsed.data.siteTitle, 'site.tagline': parsed.data.tagline, 'site.language': parsed.data.language, 'site.text': text })
  return { ok: true, text }
})
