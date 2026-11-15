// Upload one photo: multipart form data with a single `file` field.
// The body is streamed to disk, never held in memory (DESIGN.md section 7).
import busboy from 'busboy'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { defineEventHandler, getRequestHeader } from 'nuxt/server'
import { newId } from '../../../core/ids.ts'
import { acceptUpload, type AcceptResult } from '../../../pipeline/accept.ts'
import { getPipeline, getQueue } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

type Received
  = | { kind: 'file', tmpPath: string, filename: string, tooLarge: boolean }
    | { kind: 'none' }

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
    received = await receive(Readable.fromWeb(event.req.body as never), contentType, ctx.tmpDir, ctx.limits.maxUploadBytes)
  }
  catch {
    return fail(event, 400, 'The upload was incomplete or not valid form data. Try again.')
  }
  if (received.kind === 'none') return fail(event, 400, 'No file was sent. Use a field named "file".')
  if (received.tooLarge) {
    await rm(received.tmpPath, { force: true })
    return tooLarge()
  }

  const outcome: AcceptResult = await acceptUpload(ctx, { tmpPath: received.tmpPath, filename: received.filename })
  if (outcome.result === 'accepted') {
    getQueue().kick()
    return outcome
  }
  if (outcome.result === 'duplicate') {
    return fail(event, 409, 'This photo is already in your library.', outcome)
  }
  return fail(event, 422, outcome.message, { result: outcome.result, reason: outcome.reason })
})

/** Write the first `file` field to a temp file; anything else in the form is ignored. */
function receive(body: Readable, contentType: string, tmpDir: string, maxBytes: number): Promise<Received> {
  return new Promise((resolve, reject) => {
    const parser = busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: maxBytes, fields: 0, parts: 2 },
      defParamCharset: 'utf8',
    })
    let saving: Promise<Received> | undefined

    parser.on('file', (field, stream, info) => {
      if (field !== 'file' || saving) {
        stream.resume()
        return
      }
      const tmpPath = join(tmpDir, `upload-${newId()}`)
      saving = pipeline(stream, createWriteStream(tmpPath)).then(
        () => ({ kind: 'file' as const, tmpPath, filename: info.filename || 'photo', tooLarge: (stream as { truncated?: boolean }).truncated === true }),
        async (error) => {
          await rm(tmpPath, { force: true })
          throw error
        },
      )
      saving.catch(() => {}) // reported through the promise returned below
    })
    parser.on('error', reject)
    parser.on('close', () => {
      if (saving) saving.then(resolve, reject)
      else resolve({ kind: 'none' })
    })
    body.on('error', reject)
    body.pipe(parser)
  })
}
