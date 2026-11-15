// Writes the `file` field of a multipart upload to a temp file as it
// arrives; the body is never held in memory. Whatever goes wrong (the
// client disconnects, the body is malformed, the upload stalls), the
// promise settles and no temp file is left behind.
import busboy from 'busboy'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { newId } from '../core/ids.ts'

export type Received
  = | { kind: 'file', tmpPath: string, filename: string, tooLarge: boolean }
    | { kind: 'none' }

export interface ReceiveOptions {
  contentType: string
  tmpDir: string
  /** Bytes of file content accepted; more than this sets `tooLarge`. */
  maxBytes: number
  /** Give up when no data has arrived for this long. */
  idleMs?: number
}

export function receiveUpload(body: Readable, options: ReceiveOptions): Promise<Received> {
  const idleMs = options.idleMs ?? 60_000
  return new Promise((resolve, reject) => {
    let tmpPath: string | undefined
    let fileStream: Readable | undefined
    let saving: Promise<Received> | undefined
    let settled = false
    let idle: ReturnType<typeof setTimeout> | undefined

    const parser = busboy({
      headers: { 'content-type': options.contentType },
      limits: { files: 1, fileSize: options.maxBytes, fields: 0, parts: 2 },
      defParamCharset: 'utf8',
    })

    function finish(result: Received): void {
      if (settled) return
      settled = true
      clearTimeout(idle)
      resolve(result)
    }

    function fail(error: unknown): void {
      if (settled) return
      settled = true
      clearTimeout(idle)
      const reason = error instanceof Error ? error : new Error(String(error))
      // Stop everything, wait for the file to be closed, then remove it.
      fileStream?.destroy(reason)
      body.unpipe(parser)
      body.destroy()
      parser.destroy()
      const closed = saving ? saving.then(() => {}, () => {}) : Promise.resolve()
      closed
        .then(() => tmpPath ? rm(tmpPath, { force: true, maxRetries: 10, retryDelay: 50 }) : undefined)
        .then(() => reject(reason), () => reject(reason))
    }

    const touch = () => {
      clearTimeout(idle)
      idle = setTimeout(() => fail(new Error('The upload stalled.')), idleMs)
    }

    parser.on('file', (field, stream, info) => {
      if (field !== 'file' || saving) {
        stream.resume()
        return
      }
      tmpPath = join(options.tmpDir, `upload-${newId()}`)
      fileStream = stream
      const path = tmpPath
      saving = pipeline(stream, createWriteStream(path)).then(() => ({
        kind: 'file' as const,
        tmpPath: path,
        filename: info.filename || 'photo',
        tooLarge: (stream as { truncated?: boolean }).truncated === true,
      }))
      saving.catch(() => {}) // handled in fail() or on close
    })
    parser.on('error', fail)
    parser.on('close', () => {
      if (saving) saving.then(finish, fail)
      else finish({ kind: 'none' })
    })

    body.on('error', fail)
    // A connection dropped part-way closes the body without ending it.
    body.on('close', () => { if (!body.readableEnded) fail(new Error('The upload was interrupted.')) })
    body.on('data', touch)
    touch()
    body.pipe(parser)
  })
}
