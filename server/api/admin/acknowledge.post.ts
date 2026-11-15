// Records that the owner has read the notice about backups and pressed
// "I understand". Kept with the time it was pressed.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../utils/session.ts'
import { getSetting, setSettings } from '../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (getSetting<number | null>('admin.backup_notice_ack', null) === null) {
    setSettings({ 'admin.backup_notice_ack': Date.now() })
  }
  return { ok: true }
})
