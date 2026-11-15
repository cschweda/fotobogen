// Download a backup: one zip with the database, the photos as uploaded, and
// installed skins and modules. Streamed, so it is never held in memory.
import { PassThrough, Readable } from 'node:stream'
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import { writeBackup } from '../../../core/backup.ts'
import { getPaths, getSqlite } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const out = new PassThrough()
  writeBackup(getSqlite(), getPaths(), String(useRuntimeConfig().appVersion), out).catch((error) => {
    console.error(`Backup failed: ${error instanceof Error ? error.message : error}`)
    out.destroy(error instanceof Error ? error : new Error(String(error)))
  })
  const day = new Date().toISOString().slice(0, 10)
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="fotobogen-backup-${day}.zip"`,
      'cache-control': 'no-store',
    },
  })
})
