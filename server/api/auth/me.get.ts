// Who is logged in, for the pages. Never an error: `user` is null when nobody is.
import { defineEventHandler } from 'nuxt/server'
import { currentAdmin } from '../../utils/session.ts'
import { getSetting } from '../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const admin = await currentAdmin(event)
  if (!admin) return { user: null }
  return {
    user: { username: admin.username },
    // Whether the owner has read and accepted the notice about backups.
    // Until then the admin shows only that notice.
    acknowledged: getSetting<number | null>('admin.backup_notice_ack', null) !== null,
  }
})
