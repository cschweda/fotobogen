// Upload a backup to restore. The file is checked and set aside; the
// restore itself happens the next time Fotobogen starts, because the
// database cannot be swapped while the site is using it. Send the zip as
// the request body.
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { defineEventHandler } from 'nuxt/server'
import { inspectBackup, PENDING_RESTORE } from '../../../core/backup.ts'
import { newId } from '../../../core/ids.ts'
import { getPaths, getSqlite } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!event.req.body) return fail(event, 400, 'Send the backup zip as the body of the request.')
  const paths = getPaths()
  const incoming = join(paths.tmp, `restore-${newId()}.zip`)
  try {
    await pipeline(Readable.fromWeb(event.req.body as never), createWriteStream(incoming))
    const known = (getSqlite().prepare(`select name from __migrations`).all() as { name: string }[]).map(row => row.name)
    const inspected = await inspectBackup(incoming, known)
    if (!inspected.ok) return fail(event, 422, inspected.message)
    await rename(incoming, join(paths.root, PENDING_RESTORE))
    return { manifest: inspected.manifest }
  }
  catch {
    return fail(event, 400, 'The upload was interrupted. Try again; for a large backup, copy the file to the server and use `pnpm fotobogen restore` instead.')
  }
  finally {
    await rm(incoming, { force: true })
  }
})
