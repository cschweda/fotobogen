import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createQueue } from '../../server/pipeline/queue.ts'
import { fetchSamples, readManifest, type SampleEntry } from '../../server/pipeline/samples.ts'
import { imageBuffer } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

const entries: SampleEntry[] = [
  { id: 10, width: 600, height: 400, title: 'Forest', description: 'Trees in mist.', alt: 'Misty trees' },
  { id: 11, width: 400, height: 600, title: 'Hills', description: 'Green hills.', alt: 'Rolling hills' },
  { id: 12, width: 500, height: 500, title: 'Shore', description: 'A beach.', alt: 'A sandy beach' },
]

/** A stand-in for Lorem Picsum. `broken` lists ids that fail; a number says how many times. */
function fakePicsum(broken: Record<number, number> = {}, noInfo: number[] = []) {
  const calls: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const image = url.match(/\/id\/(\d+)\/(\d+)\/(\d+)\.jpg$/)
    const info = url.match(/\/id\/(\d+)\/info$/)
    if (image) {
      const id = Number(image[1])
      if ((broken[id] ?? 0) > 0) {
        broken[id]!--
        return new Response('upstream error', { status: 503 })
      }
      const bytes = await imageBuffer({ width: Number(image[2]), height: Number(image[3]), seed: id })
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg' } })
    }
    if (info) {
      if (noInfo.includes(Number(info[1]))) return new Response('nope', { status: 500 })
      return Response.json({ id: info[1], author: `Author ${info[1]}`, url: `https://unsplash.com/photos/x${info[1]}` })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return { fetcher, calls }
}

describe('fetchSamples', () => {
  it('downloads each sample, credits its photographer, and puts it through the normal pipeline', async () => {
    const ctx = testContext()
    const { fetcher, calls } = fakePicsum()
    const result = await fetchSamples(ctx, entries, { fetch: fetcher, baseUrl: 'https://picsum.test' })
    expect(result).toEqual({ added: 3, skipped: 0, failed: [] })
    expect(calls).toContain('https://picsum.test/id/10/600/400.jpg')
    expect(calls).toContain('https://picsum.test/id/10/info')
    expect(rows(ctx, 'select title, description, alt, is_sample, original_filename, width, height, status from photos order by sort_order')).toEqual([
      { title: 'Forest', description: 'Trees in mist. Photo by Author 10 on Unsplash.', alt: 'Misty trees', is_sample: 1, original_filename: 'sample-10.jpg', width: 600, height: 400, status: 'processing' },
      { title: 'Hills', description: 'Green hills. Photo by Author 11 on Unsplash.', alt: 'Rolling hills', is_sample: 1, original_filename: 'sample-11.jpg', width: 400, height: 600, status: 'processing' },
      { title: 'Shore', description: 'A beach. Photo by Author 12 on Unsplash.', alt: 'A sandy beach', is_sample: 1, original_filename: 'sample-12.jpg', width: 500, height: 500, status: 'processing' },
    ])
    const queue = createQueue(ctx)
    queue.kick()
    await queue.idle()
    expect(rows(ctx, `select count(*) as ready from photos where status = 'ready'`)).toEqual([{ ready: 3 }])
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('skips samples that are already in the library', async () => {
    const ctx = testContext()
    await fetchSamples(ctx, entries.slice(0, 2), { fetch: fakePicsum().fetcher })
    const { fetcher, calls } = fakePicsum()
    expect(await fetchSamples(ctx, entries, { fetch: fetcher })).toEqual({ added: 1, skipped: 2, failed: [] })
    expect(calls.filter(url => url.endsWith('.jpg'))).toHaveLength(1)
  })

  it('tries a failed download once more', async () => {
    const ctx = testContext()
    const { fetcher } = fakePicsum({ 11: 1 })
    expect(await fetchSamples(ctx, entries, { fetch: fetcher })).toEqual({ added: 3, skipped: 0, failed: [] })
  })

  it('carries on past a sample that cannot be downloaded, and reports it', async () => {
    const ctx = testContext()
    const { fetcher } = fakePicsum({ 11: 5 })
    expect(await fetchSamples(ctx, entries, { fetch: fetcher })).toEqual({ added: 2, skipped: 0, failed: [11] })
    expect(rows(ctx, 'select count(*) as photos from photos')).toEqual([{ photos: 2 }])
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('gives up early when nothing can be reached', async () => {
    const ctx = testContext()
    const many = Array.from({ length: 10 }, (_, index) => ({ ...entries[0]!, id: 100 + index }))
    const { fetcher, calls } = fakePicsum(Object.fromEntries(many.map(entry => [entry.id, 99])))
    const result = await fetchSamples(ctx, many, { fetch: fetcher })
    expect(result.added).toBe(0)
    expect(result.failed).toEqual(many.map(entry => entry.id))
    expect(calls.length).toBe(6) // three samples, two tries each, then no more
  })

  it('still adds the photo when the credit cannot be looked up', async () => {
    const ctx = testContext()
    const { fetcher } = fakePicsum({}, [10])
    await fetchSamples(ctx, entries.slice(0, 1), { fetch: fetcher })
    expect(rows(ctx, 'select description from photos')).toEqual([{ description: 'Trees in mist. Photo from Unsplash, via Lorem Picsum.' }])
  })

  it('reports progress after each sample', async () => {
    const ctx = testContext()
    const seen: number[] = []
    await fetchSamples(ctx, entries, { fetch: fakePicsum().fetcher, onProgress: progress => seen.push(progress.added + progress.failed.length + progress.skipped) })
    expect(seen).toEqual([1, 2, 3])
  })

  it('refuses something that is not a picture', async () => {
    const ctx = testContext()
    const fetcher = (async () => new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch
    expect(await fetchSamples(ctx, entries.slice(0, 1), { fetch: fetcher })).toEqual({ added: 0, skipped: 0, failed: [10] })
    expect(rows(ctx, 'select id from photos')).toEqual([])
  })
})

describe('the sample manifest', () => {
  const manifest = readManifest()
  it('lists 25 different photos, each with a title, description, and alt text', () => {
    expect(manifest).toHaveLength(25)
    expect(new Set(manifest.map(entry => entry.id)).size).toBe(25)
    for (const entry of manifest) {
      expect(entry.title.trim(), `title of ${entry.id}`).not.toBe('')
      expect(entry.description.trim(), `description of ${entry.id}`).not.toBe('')
      expect(entry.alt.trim(), `alt of ${entry.id}`).not.toBe('')
      expect(Math.max(entry.width, entry.height)).toBeLessThanOrEqual(2560)
      expect(entry.width * entry.height).toBeLessThan(100_000_000)
    }
  })
  it('mixes shapes so both grid layouts look right', () => {
    const shape = (entry: SampleEntry) => {
      const ratio = entry.width / entry.height
      return ratio > 2 ? 'panoramic' : ratio > 1.1 ? 'landscape' : ratio > 0.9 ? 'square' : ratio > 0.5 ? 'portrait' : 'tall'
    }
    const counts: Record<string, number> = {}
    for (const entry of manifest) counts[shape(entry)] = (counts[shape(entry)] ?? 0) + 1
    expect(counts).toEqual({ landscape: 10, portrait: 6, square: 4, panoramic: 3, tall: 2 })
  })
})

describe('cancelling', () => {
  it('stops at once when asked, keeping what was already added and counting nothing as failed', async () => {
    const ctx = testContext()
    const stop = new AbortController()
    const { fetcher, calls } = fakePicsum()
    const result = await fetchSamples(ctx, entries, {
      fetch: fetcher,
      signal: stop.signal,
      onProgress: (progress) => { if (progress.added === 1) stop.abort() },
    })
    expect(result).toEqual({ added: 1, skipped: 0, failed: [], cancelled: true })
    expect(calls.filter(url => url.endsWith('.jpg'))).toHaveLength(1)
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })
})
