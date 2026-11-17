// Switch the slideshow for other sites on or off. It decides whether pages
// of this site may be shown inside other sites, so it is for the logged-in
// owner alone: no API token reaches it, and a demo visitor changes nothing.
import { defineEventHandler, readBody } from 'nuxt/server'
import { EMBED_KEY } from '../../../utils/embed.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  // Said here as well as in the token rules, so it holds whatever those come to list.
  if (admin.token) return fail(event, 403, 'An API token cannot change this. Log in to the admin to do that.')
  const body = await readBody(event).catch(() => null) as { enabled?: unknown } | null
  if (typeof body?.enabled !== 'boolean') return fail(event, 422, 'Say whether it is on or off.')
  setSettings({ [EMBED_KEY]: body.enabled })
  return { ok: true, enabled: body.enabled }
})
