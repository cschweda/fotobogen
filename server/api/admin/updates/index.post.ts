// "Check for updates": ask GitHub now. With { "automatic": true | false }
// it instead records whether to check once a day (a yes checks straight away).
import { defineEventHandler, readBody } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { checkForUpdate, setAutomatic } from '../../../utils/updates.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ automatic?: unknown }>(event).catch(() => null)
  if (typeof body?.automatic === 'boolean') return await setAutomatic(body.automatic)
  return await checkForUpdate()
})
