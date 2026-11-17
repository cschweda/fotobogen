// Save the visitor statistics settings. This decides what script every
// visitor's browser loads, so it is for the logged-in owner alone: no API
// token reaches it (tokens are allowed only what server/utils/tokens.ts
// lists), and a demo visitor changes nothing.
import { defineEventHandler, readBody } from 'nuxt/server'
import { cleanStats } from '../../../../shared/stats.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'
import { STATS_KEY } from '../../../utils/stats.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  // Said here as well as in the token rules, so it holds whatever those come to list.
  if (admin.token) return fail(event, 403, 'An API token cannot change visitor statistics. Log in to the admin to do that.')
  const { settings, errors } = cleanStats(await readBody(event).catch(() => null))
  if (Object.keys(errors).length > 0) return fail(event, 422, 'Some of this needs another look.', { errors })
  setSettings({ [STATS_KEY]: settings })
  return { ok: true, settings }
})
