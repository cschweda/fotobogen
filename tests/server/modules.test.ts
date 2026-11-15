import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

interface Detail { status: string, own: unknown[] | null, site: unknown[], recipe: { module: string, transform: string, params: Record<string, unknown> }[], skipped: string[], medium: { url: string, width: number, height: number } | null }

describe('modules and recipes', () => {
  let server: TestServer
  let cookie: string
  let id: string
  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const detail = async () => await (await get(server, `/api/admin/photos/${id}`, { cookie })).json() as Detail
  const frame = (params: Record<string, unknown> = {}) => ({ module: 'filmframe', transform: 'negative-edge', params })

  beforeAll(async () => {
    // A module the site owner has installed: a folder in data/modules, nothing more.
    const dataDir = join(mkdtempSync(join(tmpdir(), 'fotobogen-test-')), 'data')
    mkdirSync(join(dataDir, 'modules', 'invert'), { recursive: true })
    writeFileSync(join(dataDir, 'modules', 'invert', 'module.json'), JSON.stringify({ name: 'invert', version: '0.1.0', label: 'Invert', entry: 'index.mjs' }))
    writeFileSync(join(dataDir, 'modules', 'invert', 'index.mjs'), `export default { transforms: [{ id: 'negative', label: 'Negative', params: {}, apply: image => image.negate({ alpha: false }) }] }`)
    mkdirSync(join(dataDir, 'modules', 'broken'))
    writeFileSync(join(dataDir, 'modules', 'broken', 'module.json'), '{ not json')

    server = await startServer({ dataDir })
    cookie = await completeSetup(server)
    const response = await upload(server, cookie, await imageBuffer({ width: 1000, height: 800, seed: 5 }), 'portrait.jpg')
    id = (await response.json() as { photo: { id: string } }).photo.id
    await whenProcessed(server, cookie)
  })
  afterAll(() => server.stop())

  it('lists the bundled module and the installed one, with the controls each declares', async () => {
    const { modules } = await (await get(server, '/api/admin/modules', { cookie })).json() as { modules: { name: string, source: string, enabled: boolean, error: string | null, transforms: { id: string, params: Record<string, { type: string }> }[] }[] }
    const byName = Object.fromEntries(modules.map(module => [module.name, module]))
    // Everything starts switched off.
    expect(byName.filmframe).toMatchObject({ source: 'bundled', enabled: false, error: null })
    expect(byName.filmlooks).toMatchObject({ source: 'bundled', enabled: false, error: null })
    expect(Object.entries(byName.filmframe!.transforms[0]!.params).map(([key, spec]) => [key, spec.type])).toEqual([
      ['thickness', 'range'], ['raggedness', 'range'], ['markings', 'boolean'], ['sprockets', 'boolean'], ['stock', 'select'], ['sharpen', 'range'],
    ])
    expect(byName.invert).toMatchObject({ source: 'installed', enabled: false, error: null })
    expect(byName.broken!.error).toBeTruthy()
    expect(server.output()).toContain('Module "broken" could not be loaded')
  })

  it('requires a logged-in admin', async () => {
    expect((await get(server, '/api/admin/modules')).status).toBe(401)
    expect((await get(server, `/api/admin/photos/${id}`)).status).toBe(401)
    const anonymous = await fetch(`${server.url}/api/admin/photos/${id}/recipe`, { method: 'PUT', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{"recipe":[]}' })
    expect(anonymous.status).toBe(401)
  })

  it('does nothing with a module until it is switched on', async () => {
    const off = await send('POST', `/api/admin/photos/${id}/preview`, { recipe: [frame({ thickness: 10 })] })
    const meta = await sharp(Buffer.from(await off.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([1000, 800])
    for (const name of ['filmframe', 'filmlooks', 'invert']) {
      expect((await send('PUT', `/api/admin/modules/${name}`, { enabled: true })).status).toBe(200)
    }
  })

  it('previews a recipe without saving anything', async () => {
    const response = await send('POST', `/api/admin/photos/${id}/preview`, { recipe: [frame({ thickness: 10, raggedness: 0, markings: false, sprockets: false })] })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    // 1000 x 800 with an 80 px border and 40 px of paper on each side.
    expect([meta.width, meta.height]).toEqual([1240, 1040])
    expect(await detail()).toMatchObject({ own: null, recipe: [] })
  })

  it('applies a saved recipe to every copy, leaving the original file alone', async () => {
    const before = query<{ checksum: string, bytes: number }>(server, 'select checksum, bytes from photos')[0]
    const saved = await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: [frame({ thickness: 10, raggedness: 0, markings: true, stock: 'KODAK TRI-X' })] })
    expect(saved.status).toBe(200)
    // The made-up default replaces a stock name that is not on the list.
    expect((await saved.json() as { recipe: { params: { stock: string } }[] }).recipe[0]!.params.stock).toBe('FOTOBOGEN 400')
    await whenProcessed(server, cookie)

    const after = await detail()
    expect(after.status).toBe('ready')
    expect(after.medium).toMatchObject({ width: 1240, height: 1040 })
    expect(query(server, `select type, status from jobs order by created_at, rowid`)).toEqual([{ type: 'ingest', status: 'done' }, { type: 'rerender', status: 'done' }])
    expect(query(server, 'select camera, title from photos')).toHaveLength(1)
    expect(query(server, 'select checksum, bytes from photos')[0]).toEqual(before)
    const image = await sharp(Buffer.from(await (await get(server, after.medium!.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
    expect([...image.data.subarray(0, 3)].every(value => value > 225)).toBe(true) // paper in the corner
  })

  it('skips a module that is switched off, and says so, without losing the recipe', async () => {
    expect((await send('PUT', '/api/admin/modules/filmframe', { enabled: false })).status).toBe(200)
    expect((await detail()).skipped).toEqual(['filmframe/negative-edge'])
    // Switching a module off or on renders the photos that use it again.
    await whenProcessed(server, cookie)
    expect((await detail()).medium).toMatchObject({ width: 1000, height: 800 })
    expect((await detail()).recipe).toHaveLength(1)
    const on = await send('PUT', '/api/admin/modules/filmframe', { enabled: true })
    expect(await on.json()).toEqual({ ok: true, queued: 1 })
    await whenProcessed(server, cookie)
    expect((await detail()).medium).toMatchObject({ width: 1240, height: 1040 })
    expect((await send('PUT', '/api/admin/modules/no-such-module', { enabled: true })).status).toBe(404)
  })

  it('runs an installed module, and chains transforms in order', async () => {
    const recipe = [{ module: 'invert', transform: 'negative', params: {} }, frame({ thickness: 10, raggedness: 0, markings: false, sprockets: false })]
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe })).status).toBe(200)
    await whenProcessed(server, cookie)
    const after = await detail()
    expect(after.recipe.map(step => step.module)).toEqual(['invert', 'filmframe'])
    expect(after.medium).toMatchObject({ width: 1240, height: 1040 })
  })

  it('restores the photo when its recipe is cleared', async () => {
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: [] })).status).toBe(200)
    await whenProcessed(server, cookie)
    expect(await detail()).toMatchObject({ own: [], recipe: [], medium: { width: 1000, height: 800 } })
  })

  describe('for all photos at once', () => {
    let second: string
    const medium = (photo: string) => query<{ width: number }>(server, `select width from derivatives where kind = 'medium' and photo_id = '${photo}'`)[0]!.width

    it('applies a site-wide recipe to every photo that has none of its own', async () => {
      const response = await upload(server, cookie, await imageBuffer({ width: 1000, height: 800, seed: 6 }), 'second.jpg')
      second = (await response.json() as { photo: { id: string } }).photo.id
      await whenProcessed(server, cookie)

      const saved = await send('PUT', '/api/admin/site-recipe', { recipe: [frame({ thickness: 10, raggedness: 0, markings: false, sprockets: false })] })
      // Only the second photo follows the site: the first has its own (empty) recipe.
      expect(await saved.json()).toMatchObject({ queued: 1, recipe: [{ module: 'filmframe' }] })
      await whenProcessed(server, cookie)
      expect(medium(second)).toBe(1240)
      expect(medium(id)).toBe(1000)
    })

    it('applies it to photos uploaded afterwards', async () => {
      const response = await upload(server, cookie, await imageBuffer({ width: 1000, height: 800, seed: 7 }), 'third.jpg')
      const third = (await response.json() as { photo: { id: string } }).photo.id
      await whenProcessed(server, cookie)
      expect(medium(third)).toBe(1240)
    })

    it('lets one photo follow the site again, or keep its own choice', async () => {
      expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: null })).status).toBe(200)
      await whenProcessed(server, cookie)
      expect(await detail()).toMatchObject({ own: null, recipe: [{ module: 'filmframe' }], medium: { width: 1240 } })
      expect((await send('PUT', `/api/admin/photos/${second}/recipe`, { recipe: [] })).status).toBe(200)
      await whenProcessed(server, cookie)
      expect(medium(second)).toBe(1000)
    })

    it('switches the site-wide recipe off again for everyone who follows it', async () => {
      const cleared = await send('PUT', '/api/admin/site-recipe', { recipe: [] })
      expect(await cleared.json()).toEqual({ recipe: [], queued: 2 })
      await whenProcessed(server, cookie)
      expect(medium(id)).toBe(1000)
      expect((await send('PUT', '/api/admin/site-recipe', { recipe: 'all of them' })).status).toBe(422)
      const anonymous = await fetch(`${server.url}/api/admin/site-recipe`, { method: 'PUT', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{"recipe":[]}' })
      expect(anonymous.status).toBe(401)
    })
  })

  it('refuses a recipe for a photo that does not exist or a body that is not a list', async () => {
    expect((await send('PUT', '/api/admin/photos/nope/recipe', { recipe: [] })).status).toBe(409)
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: 'frame it' })).status).toBe(422)
    expect((await send('POST', '/api/admin/photos/nope/preview', { recipe: [] })).status).toBe(404)
  })
})
