import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { listPhotos, upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('the photo library', () => {
  let server: TestServer
  let cookie: string
  const ids: Record<string, string> = {}
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const order = async () => (await listPhotos(server, cookie)).photos.map(photo => photo.filename[0]).join('')
  const publicSlugs = async () => (await (await get(server, '/api/photos')).json() as { tiles: { slug: string }[] }).tiles.map(tile => tile.slug)

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['a', 'b', 'c', 'd'].entries()) {
      const response = await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 300, height: 200 }), `${name}.jpg`)
      ids[name] = (await response.json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('requires a logged-in admin for every change', async () => {
    const anonymous = { cookie: '' }
    expect((await send('PATCH', `/api/admin/photos/${ids.a}`, { title: 'x' }, anonymous)).status).toBe(401)
    expect((await send('DELETE', `/api/admin/photos/${ids.a}`, undefined, anonymous)).status).toBe(401)
    expect((await send('POST', `/api/admin/photos/${ids.a}/move`, { to: 'top' }, anonymous)).status).toBe(401)
    expect((await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'delete' }, anonymous)).status).toBe(401)
    expect((await send('PUT', '/api/admin/settings', {}, anonymous)).status).toBe(401)
    expect((await get(server, '/api/admin/settings')).status).toBe(401)
    expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 4 }])
  })

  it('edits a photo, and the public site shows the change', async () => {
    const saved = await send('PATCH', `/api/admin/photos/${ids.a}`, { title: 'Harbour at dawn', description: 'From the ferry.', alt: 'Boats in mist', slug: 'Harbour Dawn', takenAt: Date.parse('2024-05-03T00:00:00Z') })
    expect(await saved.json()).toEqual({ ok: true, slug: 'harbour-dawn' })
    const shown = await (await get(server, '/api/photos/harbour-dawn')).json() as { title: string, description: string, alt: string, takenAt: number }
    expect(shown).toMatchObject({ title: 'Harbour at dawn', description: 'From the ferry.', alt: 'Boats in mist', takenAt: 1714694400000 })
    expect((await get(server, '/api/photos/a')).status).toBe(404) // the old address is gone
    const detail = await (await get(server, `/api/admin/photos/${ids.a}`, { cookie })).json() as { visibility: string, details: { bytes: number, mime: string } }
    expect(detail).toMatchObject({ visibility: 'public', details: { mime: 'image/jpeg' } })
  })

  it('explains invalid fields and a taken address without changing anything', async () => {
    const invalid = await send('PATCH', `/api/admin/photos/${ids.a}`, { title: 'x'.repeat(300), visibility: 'secret' })
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toMatchObject({ errors: { title: 'Use 200 characters or fewer.', visibility: 'Choose public or hidden.' } })
    const taken = await send('PATCH', `/api/admin/photos/${ids.a}`, { slug: 'b' })
    expect(taken.status).toBe(409)
    expect((await send('PATCH', '/api/admin/photos/no-such-id', { title: 'x' })).status).toBe(404)
    expect(query(server, `select title from photos where id = '${ids.a}'`)).toEqual([{ title: 'Harbour at dawn' }])
  })

  it('reorders by moving up, down, to the top, or in front of another photo', async () => {
    expect(await order()).toBe('dcba')
    await send('POST', `/api/admin/photos/${ids.a}/move`, { to: 'top' })
    expect(await order()).toBe('adcb')
    await send('POST', `/api/admin/photos/${ids.a}/move`, { to: 'down' })
    expect(await order()).toBe('dacb')
    await send('POST', `/api/admin/photos/${ids.b}/move`, { before: ids.d })
    expect(await order()).toBe('bdac')
    await send('POST', `/api/admin/photos/${ids.b}/move`, { before: null })
    expect(await order()).toBe('dacb')
    // The public site follows the same order.
    expect(await publicSlugs()).toEqual(['d', 'harbour-dawn', 'c', 'b'])
    expect((await send('POST', `/api/admin/photos/${ids.a}/move`, { to: 'sideways' })).status).toBe(422)
    expect((await send('POST', '/api/admin/photos/nope/move', { to: 'up' })).status).toBe(404)
  })

  it('hides and shows several photos at once, and can list just the hidden ones or those without alt text', async () => {
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.c, ids.d], action: 'hide' })).json()).toEqual({ changed: 2 })
    expect(await publicSlugs()).toEqual(['harbour-dawn', 'b'])
    const hidden = await (await get(server, '/api/admin/photos?show=hidden', { cookie })).json() as { photos: { filename: string, hidden: boolean }[], counts: { hidden: number, missingAlt: number } }
    expect(hidden.photos.map(photo => photo.filename)).toEqual(['d.jpg', 'c.jpg'])
    expect(hidden.counts).toMatchObject({ hidden: 2, missingAlt: 3 })
    const noAlt = await (await get(server, '/api/admin/photos?show=missing-alt', { cookie })).json() as { photos: { filename: string }[] }
    expect(noAlt.photos.map(photo => photo.filename)).toEqual(['d.jpg', 'c.jpg', 'b.jpg'])
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.c, ids.d], action: 'show' })).json()).toEqual({ changed: 2 })
    expect((await send('POST', '/api/admin/photos/bulk', { ids: [], action: 'hide' })).status).toBe(422)
    expect((await send('POST', '/api/admin/photos/bulk', { ids: [ids.a], action: 'explode' })).status).toBe(422)
  })

  it('deletes photos with their files, one at a time or several', async () => {
    const before = readdirSync(join(server.dataDir, 'derivatives')).length
    expect(await (await send('DELETE', `/api/admin/photos/${ids.d}`)).json()).toEqual({ deleted: 1 })
    expect((await send('DELETE', `/api/admin/photos/${ids.d}`)).status).toBe(404)
    expect(await (await send('POST', '/api/admin/photos/bulk', { ids: [ids.c, 'no-such-id'], action: 'delete' })).json()).toEqual({ changed: 1 })
    expect(await order()).toBe('ab')
    expect(readdirSync(join(server.dataDir, 'originals'))).toHaveLength(2)
    expect(readdirSync(join(server.dataDir, 'derivatives')).length).toBe(before / 2)
    expect((await get(server, '/photo/c')).status).toBe(404)
  })

  it('saves settings, which change the public site at once', async () => {
    const settings = { siteTitle: 'Salt and Light', tagline: 'Coastal photographs', grid: 'square', photoView: 'page', showExif: false, showLocation: false }
    expect((await send('PUT', '/api/admin/settings', settings)).status).toBe(200)
    expect(await (await get(server, '/api/admin/settings', { cookie })).json()).toMatchObject(settings)
    expect(await (await get(server, '/api/site')).json()).toMatchObject({ title: 'Salt and Light', tagline: 'Coastal photographs', grid: 'square', photoView: 'page' })
    expect(await (await get(server, '/')).text()).toContain('fb-grid--square')
    const invalid = await send('PUT', '/api/admin/settings', { ...settings, siteTitle: '', grid: 'hexagons' })
    expect(invalid.status).toBe(422)
    expect(Object.keys((await invalid.json() as { errors: Record<string, string> }).errors).sort()).toEqual(['grid', 'siteTitle'])
  })

  it('makes small previews for the strip of looks', async () => {
    const sharp = (await import('sharp')).default
    const small = await send('POST', `/api/admin/photos/${ids.a}/preview`, { recipe: [], edge: 240 })
    expect((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width).toBe(240)
    const clamped = await send('POST', `/api/admin/photos/${ids.a}/preview`, { recipe: [], edge: 99999 })
    expect((await sharp(Buffer.from(await clamped.arrayBuffer())).metadata()).width).toBe(300) // never larger than the photo
  })
})

describe('a photo that could not be processed', () => {
  it('says why on its own page, and can be tried again from there', async () => {
    const Database = (await import('better-sqlite3')).default
    const server = await startServer()
    try {
      const cookie = await completeSetup(server)
      const response = await upload(server, cookie, await imageBuffer({ seed: 9, width: 300, height: 200 }), 'pier.jpg')
      const { id } = (await response.json() as { photo: { id: string } }).photo
      await whenProcessed(server, cookie)
      // As the queue leaves a photo after its last failed try.
      const db = new Database(join(server.dataDir, 'fotobogen.db'))
      db.pragma('busy_timeout = 5000')
      db.prepare(`update photos set status = 'failed' where id = ?`).run(id)
      db.prepare(`insert into jobs (id, type, photo_id, status, attempts, error, created_at) values ('j-failed', 'ingest', ?, 'failed', 3, 'the disk is full', ?)`).run(id, Date.now())
      db.close()

      const failed = await (await get(server, `/api/admin/photos/${id}`, { cookie })).json()
      expect(failed).toMatchObject({ status: 'failed', error: 'the disk is full' })

      const retried = await fetch(`${server.url}/api/admin/photos/${id}/retry`, { method: 'POST', headers: { origin: server.url, cookie } })
      expect(retried.status).toBe(200)
      await whenProcessed(server, cookie)
      expect(await (await get(server, `/api/admin/photos/${id}`, { cookie })).json()).toMatchObject({ status: 'ready', error: null })
    }
    finally {
      await server.stop()
    }
  })
})
