import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

  it('puts the samples into two sample albums, to show how albums work', async () => {
    const { albums } = await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { id: string, title: string, description: string, count: number, onFront: boolean, visibility: string }[] }
    expect(albums.map(album => [album.title, album.count, album.onFront, album.visibility]).sort()).toEqual([
      ['Coast and mountains', 13, true, 'public'],
      ['Desk and table', 8, true, 'public'],
    ])
    expect(albums.every(album => album.description.startsWith('A sample album'))).toBe(true)
    // Visitors see them: on the albums page, and to choose from on the front page.
    expect((await (await get(server, '/api/albums')).json() as { albums: unknown[] }).albums).toHaveLength(2)
    expect((await (await get(server, '/api/site')).json() as { frontAlbums: { title: string }[] }).frontAlbums.map(album => album.title).sort()).toEqual(['Coast and mountains', 'Desk and table'])
    // Asking for the samples again makes no second pair.
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    await whenFetched(server, cookie)
    expect(query(server, 'select count(*) as n from albums')).toEqual([{ n: 2 }])
    expect(query(server, 'select count(*) as n from album_photos')).toEqual([{ n: 21 }])
  })

  it('leaves every photo untouched when a sample album is deleted', async () => {
    const { albums } = await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { id: string, title: string }[] }
    const desk = albums.find(album => album.title === 'Desk and table')!
    const gone = await fetch(`${server.url}/api/admin/albums/${desk.id}`, { method: 'DELETE', headers: { origin: server.url, cookie } })
    expect(gone.status).toBe(200)
    expect(query(server, 'select count(*) as n from albums')).toEqual([{ n: 1 }])
    expect(query(server, `select count(*) as n from photos where status = 'ready'`)).toEqual([{ n: 25 }])
    expect(await samples(server, cookie)).toMatchObject({ inLibrary: 25 })
    expect((await (await get(server, '/api/photos')).json() as { total: number }).total).toBe(25)
    expect(readdirSync(join(server.dataDir, 'originals'))).toHaveLength(25)
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
    // The sample album that was left goes with them: it has nothing in it now.
    expect(query(server, 'select count(*) as n from albums')).toEqual([{ n: 0 }])
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
    // Wait until the first few have arrived, with most still to come.
    let during = await samples(server, cookie)
    for (let tries = 0; during.done < 2 && tries < 200; tries++) {
      await new Promise(wait => setTimeout(wait, 50))
      during = await samples(server, cookie)
    }
    expect(during.state).toBe('running')
    expect(during.done).toBeGreaterThanOrEqual(2)
    expect(during.done).toBeLessThan(25)
    const cancelled = await send(server, cookie, 'DELETE')
    expect(cancelled.status).toBe(200)
    picsum.slow = 0
    expect(await samples(server, cookie)).toMatchObject({ state: 'idle', inLibrary: 0, done: 0 })
    expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 0 }])
    expect(readdirSync(join(server.dataDir, 'originals'))).toEqual([])
    // A photo that was mid-resize when it was removed is cleaned up as soon
    // as that resize ends.
    await vi.waitFor(() => expect(readdirSync(join(server.dataDir, 'derivatives'))).toEqual([]), { timeout: 10_000 })
    expect((await send(server, cookie, 'POST')).status).toBe(202)
    expect(await whenFetched(server, cookie)).toMatchObject({ state: 'done', done: 25 })
    await whenProcessed(server, cookie)
  })

  it('keeps photos the admin uploaded when samples are removed', async () => {
    const { upload } = await import('../helpers/photos.ts')
    const { imageBuffer } = await import('../helpers/images.ts')
    const mine = await upload(server, cookie, await imageBuffer({ seed: 999, width: 320, height: 240 }), 'mine.jpg')
    expect(mine.status).toBe(200)
    await whenProcessed(server, cookie)
    // The owner puts a photo of their own into one of the sample albums: that album is theirs now.
    const { albums } = await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { id: string, title: string }[] }
    const coast = albums.find(album => album.title === 'Coast and mountains')!
    await fetch(`${server.url}/api/admin/photos/bulk`, { method: 'POST', headers: { 'origin': server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ids: [(await mine.json() as { photo: { id: string } }).photo.id], action: 'add-to-album', album: coast.id }) })
    expect(await (await send(server, cookie, 'DELETE')).json()).toEqual({ removed: 25 })
    // It is kept, with their photo in it; the other sample album, now empty, is gone.
    expect(query(server, 'select a.title, (select count(*) from album_photos ap where ap.album_id = a.id) as n from albums a')).toEqual([{ title: 'Coast and mountains', n: 1 }])
    expect(query(server, 'select original_filename from photos')).toEqual([{ original_filename: 'mine.jpg' }])
    expect(readdirSync(join(server.dataDir, 'originals'))).toHaveLength(1)
  })
})
