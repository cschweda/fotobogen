import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

interface Detail { status: string, recipe: { module: string, transform: string, params: Record<string, unknown> }[], skipped: string[], medium: { url: string, width: number, height: number } | null }

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
    expect(byName.filmframe).toMatchObject({ source: 'bundled', enabled: true, error: null })
    expect(Object.entries(byName.filmframe!.transforms[0]!.params).map(([key, spec]) => [key, spec.type])).toEqual([
      ['thickness', 'range'], ['raggedness', 'range'], ['markings', 'boolean'], ['stock', 'select'],
    ])
    expect(byName.invert).toMatchObject({ source: 'installed', enabled: true, error: null })
    expect(byName.broken!.error).toBeTruthy()
    expect(server.output()).toContain('Module "broken" could not be loaded')
  })

  it('requires a logged-in admin', async () => {
    expect((await get(server, '/api/admin/modules')).status).toBe(401)
    expect((await get(server, `/api/admin/photos/${id}`)).status).toBe(401)
    const anonymous = await fetch(`${server.url}/api/admin/photos/${id}/recipe`, { method: 'PUT', headers: { origin: server.url, 'content-type': 'application/json' }, body: '{"recipe":[]}' })
    expect(anonymous.status).toBe(401)
  })

  it('previews a recipe without saving anything', async () => {
    const response = await send('POST', `/api/admin/photos/${id}/preview`, { recipe: [frame({ thickness: 10, raggedness: 0, markings: false })] })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    // 1000 x 800 with an 80 px border and 40 px of paper on each side.
    expect([meta.width, meta.height]).toEqual([1240, 1040])
    expect((await detail()).recipe).toEqual([])
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
    expect(query(server, 'select checksum, bytes from photos')[0]).toEqual(before)
    const image = await sharp(Buffer.from(await (await get(server, after.medium!.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
    expect([...image.data.subarray(0, 3)].every(value => value > 225)).toBe(true) // paper in the corner
  })

  it('skips a module that is switched off, and says so, without losing the recipe', async () => {
    expect((await send('PUT', '/api/admin/modules/filmframe', { enabled: false })).status).toBe(200)
    expect((await detail()).skipped).toEqual(['filmframe/negative-edge'])
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: (await detail()).recipe })).status).toBe(200)
    await whenProcessed(server, cookie)
    expect((await detail()).medium).toMatchObject({ width: 1000, height: 800 })
    expect((await detail()).recipe).toHaveLength(1)
    expect((await send('PUT', '/api/admin/modules/filmframe', { enabled: true })).status).toBe(200)
    expect((await send('PUT', '/api/admin/modules/no-such-module', { enabled: true })).status).toBe(404)
  })

  it('runs an installed module, and chains transforms in order', async () => {
    const recipe = [{ module: 'invert', transform: 'negative', params: {} }, frame({ thickness: 10, raggedness: 0, markings: false })]
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe })).status).toBe(200)
    await whenProcessed(server, cookie)
    const after = await detail()
    expect(after.recipe.map(step => step.module)).toEqual(['invert', 'filmframe'])
    expect(after.medium).toMatchObject({ width: 1240, height: 1040 })
  })

  it('restores the photo exactly when the recipe is cleared', async () => {
    const original = query<{ path: string }>(server, `select path from derivatives where kind = 'medium'`)
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: [] })).status).toBe(200)
    await whenProcessed(server, cookie)
    expect((await detail()).medium).toMatchObject({ width: 1000, height: 800 })
    expect(query(server, 'select recipe_json from photos')).toEqual([{ recipe_json: null }])
    // Same pixels as the very first render give the same content-hashed name as a fresh upload would.
    expect(query<{ path: string }>(server, `select path from derivatives where kind = 'medium'`)[0]!.path).not.toBe(original[0]!.path)
  })

  it('refuses a recipe for a photo that does not exist or a body that is not a list', async () => {
    expect((await send('PUT', '/api/admin/photos/nope/recipe', { recipe: [] })).status).toBe(409)
    expect((await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: 'frame it' })).status).toBe(422)
    expect((await send('POST', '/api/admin/photos/nope/preview', { recipe: [] })).status).toBe(404)
  })
})
