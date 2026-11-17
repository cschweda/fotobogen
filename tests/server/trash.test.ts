import Database from 'better-sqlite3'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Listed { id: string, slug: string, status: string, trashedAt?: number, removedOn?: number }
interface List { counts: { total: number, trash: number }, photos: Listed[] }

describe('the trash', () => {
  let server: TestServer
  let cookie: string
  const ids: Record<string, string> = {}
  const files: Record<string, Buffer> = {}
  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const list = async (query = '') => await (await get(server, `/api/admin/photos${query}`, { cookie })).json() as List
  const publicSlugs = async () => (await (await get(server, '/api/photos')).json() as { tiles: { slug: string }[] }).tiles.map(tile => tile.slug).sort()
  const originals = () => readdirSync(join(server.dataDir, 'originals')).length

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      files[name] = await imageBuffer({ seed: index + 1, width: 600, height: 400 })
      ids[name] = (await (await upload(server, cookie, files[name]!, `${name}.jpg`)).json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
    const album = (await (await send('POST', '/api/admin/albums', { title: 'Coast' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.a, ids.b], action: 'add-to-album', album })
    await send('PATCH', `/api/admin/photos/${ids.a}`, { tags: ['night'] })
  })
  afterAll(() => server.stop())

  it('takes a deleted photo off the site at once, and keeps it and its file', async () => {
    const response = await send('DELETE', `/api/admin/photos/${ids.a}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ trashed: 1 })

    // Visitors: gone from the grid, its own page, its album's count, and its tag.
    expect(await publicSlugs()).toEqual(['b', 'c'])
    expect((await get(server, '/api/photos/a')).status).toBe(404)
    expect(await (await get(server, '/api/albums/coast')).json()).toMatchObject({ total: 1 })
    expect((await get(server, '/api/tags/night')).status).toBe(404)
    expect(await (await get(server, '/feed.xml')).text()).not.toContain('/photo/a')

    // The admin: out of the library, counted in the trash.
    const library = await list()
    expect(library.photos.map(photo => photo.slug).sort()).toEqual(['b', 'c'])
    expect(library.counts).toMatchObject({ total: 2, trash: 1 })
    expect(await (await get(server, '/api/admin/overview', { cookie })).json()).toMatchObject({ photos: { total: 2 } })
    expect((await get(server, `/api/admin/photos/${ids.a}`, { cookie })).status).toBe(404)
    // The file that was uploaded is still on disk.
    expect(originals()).toBe(3)
  })

  it('lists what is in the trash, with the day each photo will be removed for good', async () => {
    const trash = await list('?trash=1')
    expect(trash.photos).toHaveLength(1)
    const [photo] = trash.photos
    expect(photo).toMatchObject({ id: ids.a, slug: 'a', status: 'trashed' })
    expect(Date.now() - photo!.trashedAt!).toBeLessThan(60_000)
    expect(photo!.removedOn! - photo!.trashedAt!).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('says a file is in the trash when it is uploaded again', async () => {
    const again = await upload(server, cookie, files.a!, 'a-again.jpg')
    expect(again.status).toBe(409)
    expect((await again.json() as { message: string }).message).toContain('in the trash')
  })

  it('puts a restored photo back as it was: on the site, in its album, with its tag', async () => {
    expect((await send('POST', `/api/admin/photos/${ids.a}/restore`)).status).toBe(200)
    const { photos } = await whenProcessed(server, cookie)
    expect(photos.find(photo => photo.id === ids.a)).toMatchObject({ status: 'ready' })
    expect(await publicSlugs()).toEqual(['a', 'b', 'c'])
    expect(await (await get(server, '/api/albums/coast')).json()).toMatchObject({ total: 2 })
    expect((await get(server, '/api/tags/night')).status).toBe(200)
    expect((await list()).counts).toMatchObject({ total: 3, trash: 0 })
    // Restoring what is not in the trash, or does not exist, changes nothing.
    expect((await send('POST', `/api/admin/photos/${ids.a}/restore`)).status).toBe(409)
    expect((await send('POST', '/api/admin/photos/nothing/restore')).status).toBe(404)
  })

  it('deletes for good only from the trash', async () => {
    // Not in the trash: refused, and still there.
    expect((await send('DELETE', `/api/admin/photos/${ids.c}?forever=1`)).status).toBe(409)
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.c], action: 'delete-forever' })).json()).toMatchObject({ changed: 0 })
    expect(originals()).toBe(3)

    // Several at once: to the trash, one back, one gone for good.
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.b, ids.c], action: 'delete' })).json()).toMatchObject({ changed: 2 })
    expect(await publicSlugs()).toEqual(['a'])
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.b, ids.c], action: 'delete' })).json()).toMatchObject({ changed: 0 }) // already there
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.b], action: 'restore' })).json()).toMatchObject({ changed: 1 })
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.c], action: 'delete-forever' })).json()).toMatchObject({ changed: 1 })
    await whenProcessed(server, cookie)
    expect(originals()).toBe(2)
    expect((await list('?trash=1')).photos).toEqual([])
    expect((await send('POST', `/api/admin/photos/${ids.c}/restore`)).status).toBe(404)
    // One at a time, too.
    expect((await send('DELETE', `/api/admin/photos/${ids.b}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/photos/${ids.b}?forever=1`)).status).toBe(200)
    expect(originals()).toBe(1)
    expect((await send('DELETE', `/api/admin/photos/${ids.b}`)).status).toBe(404)
  })

  it('removes a photo for good once it has been in the trash for thirty days', async () => {
    const fresh = (await (await upload(server, cookie, files.b!, 'recent.jpg')).json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, cookie)
    expect((await send('DELETE', `/api/admin/photos/${ids.a}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/photos/${fresh}`)).status).toBe(200)
    await server.stop()
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.prepare(`update photos set trashed_at = ? where id = ?`).run(Date.now() - 31 * 24 * 60 * 60 * 1000, ids.a)
    db.close()

    await server.restart()
    const trash = await list('?trash=1')
    expect(trash.photos.map(photo => photo.id)).toEqual([fresh]) // a day in the trash: still there
    // The files go, and the server says so, a moment after the record: wait for both.
    await expect.poll(originals).toBe(1)
    await expect.poll(() => server.output()).toContain('Removed 1 photo that had been in the trash for 30 days.')
  })
})
