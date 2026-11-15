// Runs the sample-photo download in the background and remembers how it
// went, so the setup wizard and the admin can show progress, offer another
// try, or let the admin skip it (DESIGN.md section 12).
import manifest from '../../seed/manifest.json'
import { deletePhotos } from '../pipeline/remove.ts'
import { fetchSamples, PICSUM, type SampleEntry } from '../pipeline/samples.ts'
import { getPipeline, getQueue } from './app.ts'

export interface SampleStatus {
  state: 'idle' | 'running' | 'done' | 'failed'
  total: number
  /** Samples handled so far in this run: added or already present. */
  done: number
  failed: number
  /** Runs in a row that ended in `failed`. The pages suggest skipping after two. */
  failedRuns: number
  /** A sentence for the admin when something went wrong. */
  message: string | null
}

const entries = manifest.photos as SampleEntry[]
const idle = (): SampleStatus => ({ state: 'idle', total: entries.length, done: 0, failed: 0, failedRuns: 0, message: null })
let status = idle()
let current: { stop: AbortController, finished: Promise<void> } | undefined

export const sampleStatus = (): SampleStatus => status

export function samplesInLibrary(): number {
  const { count } = getPipeline().sqlite.prepare(`select count(*) as count from photos where is_sample = 1`).get() as { count: number }
  return count
}

/** Starts the download and returns at once. False when one is already running. */
export function startSampleFetch(): boolean {
  if (current) return false
  const failedRuns = status.failedRuns
  status = { ...idle(), state: 'running', failedRuns }
  const queue = getQueue()
  const stop = new AbortController()

  const finished = fetchSamples(getPipeline(), entries, {
    // SAMPLES_BASE_URL exists for the test suite, which must not use the network.
    baseUrl: process.env.SAMPLES_BASE_URL || PICSUM,
    signal: stop.signal,
    onAccepted: () => queue.kick(),
    onProgress: (progress) => {
      status = { ...status, done: progress.added + progress.skipped, failed: progress.failed.length }
    },
  }).then((result) => {
    if (result.cancelled) return // cancelSampleFetch sets the status
    const done = result.added + result.skipped
    const failed = result.failed.length
    if (failed === 0) {
      status = { ...idle(), state: 'done', done }
      return
    }
    status = {
      state: 'failed',
      total: entries.length,
      done,
      failed,
      failedRuns: failedRuns + 1,
      message: done === 0
        ? 'The sample photos could not be downloaded. Lorem Picsum, the service they come from, may be down or unreachable from this server.'
        : `${failed} of the ${entries.length} sample photos could not be downloaded.`,
    }
    console.warn(`Sample photos: ${status.message}`)
  }, (error) => {
    status = { ...status, state: 'failed', failedRuns: failedRuns + 1, message: 'The sample photos could not be downloaded.' }
    console.error(`Sample photos: ${error instanceof Error ? error.message : error}`)
  }).finally(() => { current = undefined })

  current = { stop, finished }
  return true
}

/** Stops a running download and waits for it to wind down. */
export async function cancelSampleFetch(): Promise<void> {
  if (!current) return
  current.stop.abort()
  await current.finished
}

/** Stops any download, then removes every sample photo and its files. */
export async function removeSamples(): Promise<number> {
  await cancelSampleFetch()
  const removed = await deletePhotos(getPipeline(), 'samples')
  status = idle()
  return removed
}
