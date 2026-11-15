// The skins found at startup, which one is in use, and the options chosen for each.
import { defineEventHandler } from 'nuxt/server'
import { cleanValues, contrastWarnings } from '../../../skins/registry.ts'
import { getSkins } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'
import { activeSkin } from '../../../utils/skin.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const saved = getSetting<Record<string, unknown>>('skin.options', {})
  return {
    active: activeSkin().skin.name,
    // 'skin' (each skin's own), 'light', 'dark', or 'auto' (the visitor's device).
    mode: getSetting('skin.mode', 'skin'),
    skins: getSkins().list().map((skin) => {
      const values = cleanValues(skin, saved[skin.name])
      return {
        name: skin.name,
        label: skin.label,
        version: skin.version,
        description: skin.description,
        source: skin.source,
        mode: skin.mode,
        error: skin.error,
        options: skin.options,
        values,
        // Text the skin would make hard to read, with these options.
        warnings: skin.error ? [] : contrastWarnings(skin, values),
      }
    }),
  }
})
