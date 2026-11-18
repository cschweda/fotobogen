// A skin can set a look for every photo. Choosing the skin applies it;
// the owner can decline it, change it, or switch it off, and any one photo
// can still have its own.
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

describe('a skin that brings a look', () => {
  let server: TestServer
  let cookie: string
  let follows: string
  let keepsOwn: string

  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const choose = async (body: Record<string, unknown>) => {
    const response = await send('PUT', '/api/admin/skins', { options: {}, ...body })
    expect(response.status).toBe(200)
    return (await response.json() as { look: { applied: boolean, queued: number } }).look
  }
  const skins = async () => await (await get(server, '/api/admin/skins', { cookie })).json() as { lookFrom: string | null, skins: { name: string, look: string[] }[] }
  const modules = async () => await (await get(server, '/api/admin/modules', { cookie })).json() as { siteRecipe: { module: string, params: Record<string, unknown> }[], modules: { name: string, enabled: boolean }[] }
  /** How much colour the copy visitors see has: 0 for a black-and-white picture. */
  const colour = async (id: string) => {
    const detail = await (await get(server, `/api/admin/photos/${id}`, { cookie })).json() as { medium: { url: string } }
    const { data } = await sharp(Buffer.from(await (await get(server, detail.medium.url)).arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let total = 0
    for (let i = 0; i < data.length; i += 3) total += Math.max(data[i]!, data[i + 1]!, data[i + 2]!) - Math.min(data[i]!, data[i + 1]!, data[i + 2]!)
    return total / (data.length / 3)
  }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    const ids: string[] = []
    for (const seed of [11, 12]) {
      const response = await upload(server, cookie, await imageBuffer({ width: 600, height: 400, seed }), `photo-${seed}.jpg`)
      ids.push((await response.json() as { photo: { id: string } }).photo.id)
    }
    ;[follows, keepsOwn] = ids as [string, string]
    await whenProcessed(server, cookie)
    // One photo is set to have no look of its own, whatever the site does.
    await send('PUT', `/api/admin/photos/${keepsOwn}/recipe`, { recipe: [] })
    await whenProcessed(server, cookie)
  })
  afterAll(async () => { await server.stop() })

  it('says in words which skins bring a look', async () => {
    const listed = await skins()
    expect(listed.lookFrom).toBeNull()
    expect(Object.fromEntries(listed.skins.map(skin => [skin.name, skin.look]))).toMatchObject({ swiss: [], papier: [], rangefinder: ['Film look: B&W 400 (Tri-X style)'] })
    expect(await colour(follows)).toBeGreaterThan(5)
  })

  it('sets the look for every photo when the skin is chosen, switching on the module it needs', async () => {
    expect((await modules()).modules.find(module => module.name === 'filmlooks')!.enabled).toBe(false)
    expect(await choose({ active: 'rangefinder' })).toEqual({ applied: true, queued: 1 })
    await whenProcessed(server, cookie)

    const now = await modules()
    expect(now.modules.find(module => module.name === 'filmlooks')!.enabled).toBe(true)
    expect(now.siteRecipe).toMatchObject([{ module: 'filmlooks', params: { look: 'B&W 400 (Tri-X style)', sharpen: 60 } }])
    expect((await skins()).lookFrom).toBe('rangefinder')
    // The photo that follows the site is black and white; the one with its own choice is not.
    expect(await colour(follows)).toBeLessThan(1)
    expect(await colour(keepsOwn)).toBeGreaterThan(5)
  })

  it('renders nothing again when the skin is saved a second time', async () => {
    expect(await choose({ active: 'rangefinder' })).toEqual({ applied: true, queued: 0 })
  })

  it('takes the look away again when another skin is chosen', async () => {
    expect(await choose({ active: 'swiss' })).toEqual({ applied: false, queued: 1 })
    await whenProcessed(server, cookie)
    expect((await modules()).siteRecipe).toEqual([])
    expect((await skins()).lookFrom).toBeNull()
    expect(await colour(follows)).toBeGreaterThan(5)
  })

  it('lets the owner use the skin without its look', async () => {
    expect(await choose({ active: 'rangefinder', useLook: false })).toEqual({ applied: false, queued: 0 })
    expect((await modules()).siteRecipe).toEqual([])
    // And turn it on later, or off again, from the same page.
    expect(await choose({ active: 'rangefinder', useLook: true })).toEqual({ applied: true, queued: 1 })
    expect(await choose({ active: 'rangefinder', useLook: false })).toEqual({ applied: false, queued: 1 })
    await whenProcessed(server, cookie)
  })

  it('leaves alone a look the owner set for themselves', async () => {
    await choose({ active: 'rangefinder' })
    // The owner changes the look on the Modules page: it is theirs now.
    const own = [{ module: 'filmlooks', transform: 'film-look', params: { look: 'Colour slide (Kodachrome style)' } }]
    expect((await send('PUT', '/api/admin/site-recipe', { recipe: own })).status).toBe(200)
    expect((await skins()).lookFrom).toBeNull()
    // Changing to a skin with no look does not remove it.
    expect(await choose({ active: 'papier' })).toEqual({ applied: false, queued: 0 })
    expect((await modules()).siteRecipe).toMatchObject([{ params: { look: 'Colour slide (Kodachrome style)' } }])
    await whenProcessed(server, cookie)
    expect(await colour(follows)).toBeGreaterThan(5)
    await choose({ active: 'swiss' })
  })

  it('gives the owner\'s own look back when a skin that replaced it is left again', async () => {
    // Found by the review of 18 November 2026: the owner's look was lost for good, without a word.
    const own = [{ module: 'filmlooks', transform: 'film-look', params: { look: 'Colour slide (Kodachrome style)' } }]
    expect((await send('PUT', '/api/admin/site-recipe', { recipe: own })).status).toBe(200)
    await whenProcessed(server, cookie)
    // The Skins page can say what a skin's look would replace.
    expect((await skins() as unknown as { ownLook: string[] }).ownLook).toEqual(['Film look: Colour slide (Kodachrome style)'])

    await choose({ active: 'rangefinder' })
    expect((await modules()).siteRecipe).toMatchObject([{ params: { look: 'B&W 400 (Tri-X style)' } }])
    expect((await skins() as unknown as { ownLook: string[] }).ownLook).toEqual(['Film look: Colour slide (Kodachrome style)'])

    await choose({ active: 'swiss' })
    expect((await modules()).siteRecipe).toMatchObject([{ params: { look: 'Colour slide (Kodachrome style)' } }])
    expect((await skins()).lookFrom).toBeNull()
    await whenProcessed(server, cookie)
    expect(await colour(follows)).toBeGreaterThan(5)

    // The same when the skin is kept and only its look is declined.
    await choose({ active: 'rangefinder' })
    await choose({ active: 'rangefinder', useLook: false })
    expect((await modules()).siteRecipe).toMatchObject([{ params: { look: 'Colour slide (Kodachrome style)' } }])
    await whenProcessed(server, cookie)
  })
})
