// The site's own words: its title and tagline, the language it is written in,
// and the replacement for each piece of fixed text on the public pages.
import { defineEventHandler } from 'nuxt/server'
import { cleanLanguage, cleanText } from '../../../../shared/site-text.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    siteTitle: getSetting('site.title', ''),
    tagline: getSetting('site.tagline', ''),
    language: cleanLanguage(getSetting('site.language', 'en')),
    // Only what was changed; everything else uses the default.
    text: cleanText(getSetting<unknown>('site.text', {})),
  }
})
