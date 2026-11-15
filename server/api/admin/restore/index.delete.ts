// Cancel a restore that is waiting for the next restart.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { defineEventHandler } from 'nuxt/server'
import { PENDING_RESTORE } from '../../../core/backup.ts'
import { getPaths } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await rm(join(getPaths().root, PENDING_RESTORE), { force: true })
  return { ok: true }
})
