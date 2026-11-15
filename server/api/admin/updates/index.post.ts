// "Check for updates": ask GitHub now. With { "automatic": true | false }
// it instead switches the once-a-day check on or off.
import { defineEventHandler, readBody } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { checkForUpdate, setAutomatic, updateStatus } from '../../../utils/updates.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ automatic?: unknown }>(event).catch(() => null)
  if (typeof body?.automatic === 'boolean') {
    setAutomatic(body.automatic)
    return updateStatus()
  }
  return await checkForUpdate()
})
