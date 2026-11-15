// Start downloading the sample photos. Answers at once; the download runs in
// the background and GET /api/admin/samples reports its progress.
import { defineEventHandler, setResponseStatus } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { startSampleFetch } from '../../../utils/samples.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!startSampleFetch()) return fail(event, 409, 'The sample photos are already being downloaded.')
  setResponseStatus(event, 202)
  return { ok: true }
})
