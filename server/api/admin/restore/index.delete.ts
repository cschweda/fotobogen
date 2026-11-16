// Cancel a restore that is waiting for the next restart.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { defineEventHandler } from 'nuxt/server'
import { PENDING_ADMIN_RESTORE, PENDING_RESTORE } from '../../../core/backup.ts'
import { getPaths } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  for (const name of [PENDING_ADMIN_RESTORE, PENDING_RESTORE]) await rm(join(getPaths().root, name), { force: true })
  return { ok: true }
})
