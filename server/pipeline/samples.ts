// Sample photos (DESIGN.md section 12): fetched from Lorem Picsum by fixed
// id when the admin asks for them, never shipped with the software. This is
// the only code in Fotobogen that makes an outbound request.
import { createWriteStream, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { newId } from '../core/ids.ts'
import { acceptUpload } from './accept.ts'
import type { PipelineContext } from './context.ts'

export interface SampleEntry {
  /** The photo's id at Lorem Picsum. Fixed, so every install gets the same set. */
  id: number
  width: number
  height: number
  title: string
  description: string
  alt: string
}

export interface SampleResult {
  /** True when the download was stopped before the end. */
  cancelled?: boolean
  added: number
  /** Already in the library. */
  skipped: number
  /** Picsum ids that could not be downloaded. */
  failed: number[]
}

export interface SampleOptions {
  baseUrl?: string
  fetch?: typeof fetch
  /** Called after each sample, for progress displays. */
  onProgress?: (progress: SampleResult) => void
  /** Called after a sample has been accepted, so the caller can start the queue. */
  onAccepted?: () => void
  /** Abort to stop the download; samples already added stay. */
  signal?: AbortSignal
}

export const PICSUM = 'https://picsum.photos'
const REQUEST_TIMEOUT_MS = 20_000
// If the first few samples all fail, the service is unreachable: stop
// rather than wait out every remaining timeout.
const GIVE_UP_AFTER = 3

/** For the command-line tool. The server bundles the manifest instead. */
export function readManifest(): SampleEntry[] {
  const file = fileURLToPath(new URL('../../seed/manifest.json', import.meta.url))
  return (JSON.parse(readFileSync(file, 'utf8')) as { photos: SampleEntry[] }).photos
}

const timeLimit = (signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)

async function download(fetcher: typeof fetch, url: string, target: string, maxBytes: number, signal?: AbortSignal): Promise<void> {
  const response = await fetcher(url, { signal: timeLimit(signal), redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  let received = 0
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length
      done(received > maxBytes ? new Error('The download is larger than the upload limit.') : null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(target))
}

/** "Photo by ... on Unsplash", from Picsum's record of where the photo came from. */
async function credit(fetcher: typeof fetch, baseUrl: string, id: number, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetcher(`${baseUrl}/id/${id}/info`, { signal: timeLimit(signal) })
    const info = response.ok ? await response.json() as { author?: unknown } : {}
    const author = typeof info.author === 'string' ? info.author.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
    if (author) return `Photo by ${author} on Unsplash.`
  }
  catch { /* fall through to the general credit */ }
  return 'Photo from Unsplash, via Lorem Picsum.'
}

export async function fetchSamples(ctx: PipelineContext, entries: SampleEntry[], options: SampleOptions = {}): Promise<SampleResult> {
  const fetcher = options.fetch ?? fetch
  const baseUrl = (options.baseUrl ?? PICSUM).replace(/\/+$/, '')
  const result: SampleResult = { added: 0, skipped: 0, failed: [] }
  const present = ctx.sqlite.prepare(`select 1 from photos where is_sample = 1 and original_filename = ?`)

  const { signal } = options
  for (const [index, entry] of entries.entries()) {
    const filename = `sample-${entry.id}.jpg`
    if (signal?.aborted) {
      result.cancelled = true
      break
    }
    if (present.get(filename)) {
      result.skipped++
    }
    else if (result.added === 0 && result.skipped === 0 && result.failed.length >= GIVE_UP_AFTER) {
      result.failed.push(...entries.slice(index).map(rest => rest.id))
      options.onProgress?.({ ...result, failed: [...result.failed] })
      break
    }
    else {
      const tmpPath = join(ctx.tmpDir, `sample-${newId()}`)
      const url = `${baseUrl}/id/${entry.id}/${entry.width}/${entry.height}.jpg`
      let added = false
      try {
        await download(fetcher, url, tmpPath, ctx.limits.maxUploadBytes, signal).catch((error) => {
          if (signal?.aborted) throw error
          return download(fetcher, url, tmpPath, ctx.limits.maxUploadBytes, signal) // one more try
        })
        const outcome = await acceptUpload(ctx, {
          tmpPath,
          filename,
          isSample: true,
          title: entry.title,
          description: `${entry.description} ${await credit(fetcher, baseUrl, entry.id, signal)}`,
          alt: entry.alt,
        })
        if (outcome.result === 'duplicate') result.skipped++
        added = outcome.result === 'accepted'
      }
      catch { /* counted as failed below */ }
      finally {
        await rm(tmpPath, { force: true })
      }
      if (added) {
        result.added++
        options.onAccepted?.()
      }
      else if (signal?.aborted) {
        result.cancelled = true
        break
      }
      else if (!present.get(filename)) {
        result.failed.push(entry.id)
      }
    }
    options.onProgress?.({ ...result, failed: [...result.failed] })
  }
  return result
}
