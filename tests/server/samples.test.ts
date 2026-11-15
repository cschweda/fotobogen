import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { whenProcessed } from '../helpers/photos.ts'
import { startFakePicsum, type FakePicsum } from '../helpers/picsum.ts'
import { get, post, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

interface Status { state: string, total: number, done: number, failed: number, failedRuns: number, message: string | null, inLibrary: number }

async function samples(server: TestServer, cookie: string): Promise<Status> {
  return await (await get(server, '/api/admin/samples', { cookie })).json() as Status
}
async function whenFetched(server: TestServer, cookie: string): Promise<Status> {
  for (let tries = 0; tries < 600; tries++) {
    const status = await samples(server, cookie)
    if (status.state !== 'running') return status
    await new Promise(wait => setTimeout(wait, 100))
  }
  throw new Error('The sample download did not finish.')
}
const send = (server: TestServer, cookie: string, method: string) =>
  fetch(server.url + '/api/admin/samples', { method, headers: { origin: server.url, cookie } })

describe('sample photos', () => {
  let picsum: FakePicsum
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    picsum = await startFakePicsum()
    server = await startServer({ env: { SAMPLES_BASE_URL: picsum.url } })
  })
  afterAll(async () => {
    await server.stop()
    await picsum.stop()
  })

  it('makes no outside request when setup chooses to start empty', async () => {
    const empty = await startServer({ env: { SAMPLES_BASE_URL: picsum.url } })
    try {
      const emptyCookie = await completeSetup(empty, { samples: false })
      expect(await samples(empty, emptyCookie)).toMatchObject({ state: 'idle', inLibrary: 0, total: 25 })
      await new Promise(wait => setTimeout(wait, 300))
      expect(picsum.requests).toEqual([])
    }
    finally {
      await empty.stop()
    }
  })

  it('downloads all 25 when setup asks for them, without holding up setup', async () => {
    cookie = await completeSetup(server, { samples: true })
    const done = await whenFetched(server, cookie)
    expect(done).toMatchObject({ state: 'done', total: 25, done: 25, failed: 0, message: null, inLibrary: 25 })
    const { photos, counts } = await whenProcessed(server, cookie)
    expect(counts).toMatchObject({ total: 25, samples: 25, failed: 0 })
    expect(photos.every(photo => photo.isSample && photo.status === 'ready' && photo.thumb)).toBe(true)
    expect(query(server, `select count(*) as credited from photos where description like '%Photo by Author % on Unsplash.'`)).toEqual([{ credited: 25 }])
    expect(query(server, `select count(*) as described from photos where title <> '' and alt <> ''`)).toEqual([{ described: 25 }])
  })

  it('requires a logged-in admin', async () => {
    expect((await get(server, '/api/admin/samples')).status).toBe(401)
    expect((await send(server, '', 'POST')).status).toBe(401)
    expect((await send(server, '', 'DELETE')).status).toBe(401)
  })

  it('removes every sample and its files in one action', async () => {
    const response = await send(server, cookie, 'DELETE')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ removed: 25 })
    expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 0 }])
    expect(query(server, 'select count(*) as n from derivatives')).toEqual([{ n: 0 }])
    expect(query(server, 'select count(*) as n from jobs')).toEqual([{ n: 0 }])
    expect(readdirSync(join(server.dataDir, 'originals'))).toEqual([])
    expect(readdirSync(join(server.dataDir, 'derivatives'))).toEqual([])
    expect(await samples(server, cookie)).toMatchObject({ state: 'idle', inLibrary: 0 })
  })

  it('says so, and leaves the library empty, when Lorem Picsum cannot be reached', async () => {
    picsum.down = true
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    const failed = await whenFetched(server, cookie)
    expect(failed).toMatchObject({ state: 'failed', done: 0, failed: 25, failedRuns: 1, inLibrary: 0 })
    expect(failed.message).toContain('could not be downloaded')
  })

  it('counts failed tries in a row, so the pages can offer to skip', async () => {
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    expect(await whenFetched(server, cookie)).toMatchObject({ state: 'failed', failedRuns: 2 })
    picsum.down = false
  })

  it('skipping clears the failure and leaves an empty library', async () => {
    expect(await (await send(server, cookie, 'DELETE')).json()).toEqual({ removed: 0 })
    expect(await samples(server, cookie)).toMatchObject({ state: 'idle', failedRuns: 0, message: null, inLibrary: 0 })
  })

  it('can be asked again from the admin, and fetches them', async () => {
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    expect(await whenFetched(server, cookie)).toMatchObject({ state: 'done', done: 25, failedRuns: 0, inLibrary: 25 })
    await whenProcessed(server, cookie)
  })

  it('refuses to start a second download while one is running, and cancelling removes what was fetched', async () => {
    await send(server, cookie, 'DELETE')
    picsum.slow = 150
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    expect((await send(server, cookie, 'POST')).status).toBe(409)
    await new Promise(wait => setTimeout(wait, 500))
    const during = await samples(server, cookie)
    expect(during.state).toBe('running')
    expect(during.done).toBeGreaterThan(0)
    expect(during.done).toBeLessThan(25)
    const cancelled = await send(server, cookie, 'DELETE')
    expect(cancelled.status).toBe(200)
    picsum.slow = 0
    expect(await samples(server, cookie)).toMatchObject({ state: 'idle', inLibrary: 0, done: 0 })
    await whenProcessed(server, cookie)
    expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 0 }])
    expect(readdirSync(join(server.dataDir, 'originals'))).toEqual([])
    expect(readdirSync(join(server.dataDir, 'derivatives'))).toEqual([])
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    expect(await whenFetched(server, cookie)).toMatchObject({ state: 'done', done: 25 })
    await whenProcessed(server, cookie)
  })

  it('keeps photos the admin uploaded when samples are removed', async () => {
    const { upload } = await import('../helpers/photos.ts')
    const { imageBuffer } = await import('../helpers/images.ts')
    expect((await upload(server, cookie, await imageBuffer({ seed: 999, width: 320, height: 240 }), 'mine.jpg')).status).toBe(200)
    await whenProcessed(server, cookie)
    expect(await (await send(server, cookie, 'DELETE')).json()).toEqual({ removed: 25 })
    expect(query(server, 'select original_filename from photos')).toEqual([{ original_filename: 'mine.jpg' }])
    expect(readdirSync(join(server.dataDir, 'originals'))).toHaveLength(1)
  })
})
