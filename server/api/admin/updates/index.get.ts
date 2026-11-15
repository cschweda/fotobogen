// What is known about newer versions. Does not contact GitHub by itself,
// unless the admin has switched daily checks on.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { checkDailyIfWanted, updateStatus } from '../../../utils/updates.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  checkDailyIfWanted()
  return updateStatus()
})
