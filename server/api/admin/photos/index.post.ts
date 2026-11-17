// Upload one photo: multipart form data with a single `file` field.
// The body is streamed to disk, never held in memory (DESIGN.md section 7).
import { rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { defineEventHandler, getRequestHeader } from 'nuxt/server'
import { acceptUpload, type AcceptResult } from '../../../pipeline/accept.ts'
import { receiveUpload, type Received } from '../../../pipeline/receive.ts'
import { getPipeline, getQueue } from '../../../utils/app.ts'
import { photoUploaded } from '../../../utils/photo-events.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

// Room for the multipart boundaries and headers around the file.
const ENVELOPE_BYTES = 64 * 1024

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const ctx = getPipeline()
  const limitMb = Math.round(ctx.limits.maxUploadBytes / 1024 / 1024)
  const tooLarge = () => fail(event, 413, `This file is larger than the ${limitMb} MB upload limit.`)

  const contentType = getRequestHeader(event, 'content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !event.req.body) {
    return fail(event, 400, 'Send the photo as multipart form data in a field named "file".')
  }
  // Refuse an oversized upload before reading any of it.
  const declared = Number(getRequestHeader(event, 'content-length'))
  if (declared > ctx.limits.maxUploadBytes + ENVELOPE_BYTES) return tooLarge()

  let received: Received
  try {
    received = await receiveUpload(Readable.fromWeb(event.req.body as never), {
      contentType, tmpDir: ctx.tmpDir, maxBytes: ctx.limits.maxUploadBytes,
    })
  }
  catch {
    return fail(event, 400, 'The upload was incomplete or not valid form data. Try again.')
  }
  if (received.kind === 'none') return fail(event, 400, 'No file was sent. Use a field named "file".')
  if (received.tooLarge) {
    await rm(received.tmpPath, { force: true })
    return tooLarge()
  }

  const outcome: AcceptResult = await acceptUpload(ctx, {
    tmpPath: received.tmpPath,
    filename: received.filename,
    // New uploads go straight to the site, or wait as drafts, as the owner chose in Settings.
    visibility: getSetting<'public' | 'hidden'>('uploads.default_visibility', 'public'),
  })
  if (outcome.result === 'accepted') {
    photoUploaded(outcome.photo.id)
    getQueue().kick()
    return outcome
  }
  if (outcome.result === 'duplicate') {
    // In the trash it is not in the library, but it is still here: say where, and what to do.
    if (outcome.existing.trashed) return fail(event, 409, 'This photo is in the trash. Restore it from there (Admin, Library, Trash), or delete it for good first.', outcome)
    return fail(event, 409, 'This photo is already in your library.', outcome)
  }
  return fail(event, 422, outcome.message, { result: outcome.result, reason: outcome.reason })
})
