// Remove every sample photo and its files in one action. If a download is
// running it is stopped first, so this is also "cancel" and "skip".
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { removeSamples } from '../../../utils/samples.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { removed: await removeSamples() }
})
