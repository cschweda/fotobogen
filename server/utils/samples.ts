// Runs the sample-photo download in the background and remembers how it
// went, so the setup wizard and the admin can show progress, offer another
// try, or let the admin skip it (DESIGN.md section 12).
import manifest from '../../seed/manifest.json'
import { addToAlbum, createAlbum, deleteAlbum } from '../pipeline/collections.ts'
import { deletePhotos } from '../pipeline/remove.ts'
import { fetchSamples, PICSUM, type SampleEntry } from '../pipeline/samples.ts'
import { getPipeline, getQueue } from './app.ts'
import { getSetting, setSettings } from './settings.ts'

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

const entries = manifest.photos as (SampleEntry & { album?: string })[]

// The samples come with two albums, to show how albums work. Which albums
// those are is remembered here by their ids, so that removing the samples
// can take away the ones left empty, and asking for the samples again does
// not make a second pair.
const SAMPLE_ALBUMS_KEY = 'samples.albums'
const sampleAlbums = manifest.albums as { key: string, title: string, description: string }[]

/** Makes the sample albums that are missing and puts the sample photos that have arrived into them. */
function arrangeSampleAlbums(): void {
  const ctx = getPipeline()
  const known = { ...getSetting<Record<string, string>>(SAMPLE_ALBUMS_KEY, {}) }
  const photoId = ctx.sqlite.prepare(`select id from photos where is_sample = 1 and original_filename = ?`)
  for (const album of sampleAlbums) {
    const ids = entries.filter(entry => entry.album === album.key)
      .map(entry => (photoId.get(`sample-${entry.id}.jpg`) as { id: string } | undefined)?.id)
      .filter(id => id !== undefined)
    if (ids.length === 0) continue
    let id = known[album.key]
    // Made the first time, and again if the owner deleted it and then asked for the samples once more.
    if (!id || !ctx.sqlite.prepare(`select 1 from albums where id = ?`).get(id)) {
      const made = createAlbum(ctx, { title: album.title, description: album.description })
      if (!made.ok) continue
      id = made.id
      known[album.key] = id
    }
    addToAlbum(ctx, id, ids)
  }
  // Nothing is written when no sample arrived: there are no albums to remember.
  if (Object.keys(known).length > 0) setSettings({ [SAMPLE_ALBUMS_KEY]: known })
}

/** Takes away the sample albums that have nothing left in them. One the owner has put photos of their own into stays. */
function removeEmptySampleAlbums(): void {
  const ctx = getPipeline()
  const count = ctx.sqlite.prepare(`select count(*) as count from album_photos where album_id = ?`)
  for (const id of Object.values(getSetting<Record<string, string>>(SAMPLE_ALBUMS_KEY, {}))) {
    if (typeof id === 'string' && (count.get(id) as { count: number }).count === 0) deleteAlbum(ctx, id)
  }
  if (Object.keys(getSetting<Record<string, string>>(SAMPLE_ALBUMS_KEY, {})).length > 0) setSettings({ [SAMPLE_ALBUMS_KEY]: {} })
}
const idle = (): SampleStatus => ({ state: 'idle', total: entries.length, done: 0, failed: 0, failedRuns: 0, message: null })
let status = idle()
let current: { stop: AbortController, finished: Promise<void> } | undefined
let removing = false

export const sampleStatus = (): SampleStatus => status

export function samplesInLibrary(): number {
  const { count } = getPipeline().sqlite.prepare(`select count(*) as count from photos where is_sample = 1`).get() as { count: number }
  return count
}

/** Starts the download and returns at once. False when one is already running. */
export function startSampleFetch(): boolean {
  if (current || removing) return false
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
    if (result.cancelled) return // removeSamples, which cancelled it, resets the status
    try {
      arrangeSampleAlbums()
    }
    catch (error) {
      // The photos are there; only the albums that show them off are not.
      console.warn(`Sample photos: the sample albums could not be made: ${error instanceof Error ? error.message : error}`)
    }
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
  removing = true
  try {
    await cancelSampleFetch()
    const removed = await deletePhotos(getPipeline(), 'samples')
    removeEmptySampleAlbums()
    if (removed.leftBehind.length > 0) {
      console.warn(`Sample photos: ${removed.leftBehind.length} files could not be deleted and were left in the data directory: ${removed.leftBehind.join(', ')}`)
    }
    return removed.count
  }
  finally {
    removing = false
    status = idle()
  }
}
