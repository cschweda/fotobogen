// Choose the skin and its options. Takes effect on the next page view; nothing is rebuilt.
import { defineEventHandler, readBody } from 'nuxt/server'
import { cleanValues, contrastWarnings } from '../../../skins/registry.ts'
import { getSkins } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting, setSettings } from '../../../utils/settings.ts'
import { MODE_CHOICES, type ModeChoice } from '../../../utils/skin.ts'
import { applySkinLook } from '../../../utils/skin-look.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ active?: unknown, options?: unknown, mode?: unknown, useLook?: unknown }>(event).catch(() => null)
  const skin = typeof body?.active === 'string' ? getSkins().get(body.active) : undefined
  if (!skin) return fail(event, 404, 'There is no such skin.')
  if (skin.error) return fail(event, 422, `This skin cannot be used: ${skin.error}`)

  const values = cleanValues(skin, body?.options)
  // Left out, the mode stays as it was.
  const mode = MODE_CHOICES.includes(body?.mode as ModeChoice) ? body!.mode as ModeChoice : getSetting<ModeChoice>('skin.mode', 'skin')
  setSettings({
    'skin.mode': mode,
    'skin.active': skin.name,
    // Each skin keeps its own options, so switching back restores them.
    'skin.options': { ...getSetting<Record<string, unknown>>('skin.options', {}), [skin.name]: values },
  })
  // A skin may bring a look for every photo with it. It is used unless the owner says not to.
  const look = applySkinLook(skin, body?.useLook !== false)
  return { active: skin.name, mode, look, values, warnings: contrastWarnings(skin, values) }
})
