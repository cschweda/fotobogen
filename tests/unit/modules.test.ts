import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import filmframe from '../../modules/filmframe/index.mjs'
import filmframeManifest from '../../modules/filmframe/module.json'
import filmlooks from '../../modules/filmlooks/index.mjs'
import filmlooksManifest from '../../modules/filmlooks/module.json'
import { checkDefinition, checkManifest, coerceParams } from '../../server/modules/contract.ts'
import { createRegistry, type Raster } from '../../server/modules/registry.ts'
import { testContext, rows } from '../helpers/pipeline.ts'

const bundled = [{ manifest: filmframeManifest, definition: filmframe }, { manifest: filmlooksManifest, definition: filmlooks }]

async function raster(width: number, height: number, colour = '#3a6ea5'): Promise<Raster> {
  const { data, info } = await sharp({ create: { width, height, channels: 3, background: colour } }).raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}
const pixel = (r: Raster, x: number, y: number) => [...r.data.subarray((y * r.width + x) * r.channels, (y * r.width + x) * r.channels + 3)]
const step = (params: Record<string, unknown> = {}) => ({ module: 'filmframe', transform: 'negative-edge', params: params as never })

function installed(files: Record<string, Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fb-modules-'))
  for (const [folder, contents] of Object.entries(files)) {
    mkdirSync(join(dir, folder))
    for (const [name, text] of Object.entries(contents)) writeFileSync(join(dir, folder, name), text)
  }
  return dir
}
const manifest = (name: string) => JSON.stringify({ name, version: '1.0.0', label: name, entry: 'index.mjs' })

describe('the module contract', () => {
  it('accepts a well-formed manifest and names what is wrong with a bad one', () => {
    expect(checkManifest({ name: 'mono', version: '1.0.0', label: 'Monochrome', entry: 'index.mjs' }).name).toBe('mono')
    expect(() => checkManifest({ name: 'Mono!', version: '1', label: 'x', entry: 'index.mjs' })).toThrow(/"name"/)
    expect(() => checkManifest({ name: 'mono', version: '1', label: 'x', entry: '../../etc/passwd.js' })).toThrow(/"entry"/)
    expect(() => checkManifest('nope')).toThrow(/JSON object/)
  })
  it('requires every transform to have an id, a label, and an apply function', () => {
    expect(() => checkDefinition({})).toThrow(/transforms/)
    expect(() => checkDefinition({ transforms: [{ id: 'a', label: 'A' }] })).toThrow(/"apply"/)
    expect(() => checkDefinition({ transforms: [{ id: 'a', label: 'A', apply() {}, params: { size: { type: 'slider' } } }] })).toThrow(/unknown type/)
    expect(() => checkDefinition({ transforms: [{ id: 'a', label: 'A', apply() {}, params: { size: { type: 'range', min: 5, max: 1, default: 2 } } }] })).toThrow(/min below max/)
  })
  it('turns whatever parameters were sent into valid ones', () => {
    const specs = checkDefinition(filmframe).transforms[0]!.params
    expect(coerceParams(specs, { thickness: 999, raggedness: 'lots', markings: 'yes', stock: 'KODAK', extra: 1 })).toEqual({
      thickness: 14, raggedness: 60, markings: true, sprockets: true, stock: 'FOTOBOGEN 400', sharpen: 0,
    })
    expect(coerceParams(specs, undefined)).toEqual({ thickness: 6, raggedness: 60, markings: true, sprockets: true, stock: 'FOTOBOGEN 400', sharpen: 0 })
  })
})

describe('the film frame module', () => {
  it('surrounds the photo with a black edge on white paper, leaving the photo itself untouched', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(400, 300), [step({ thickness: 10, raggedness: 0, markings: false, sprockets: false })])
    // 10% of the shorter side is a 30 px border, plus 15 px of paper, on every side.
    expect([out.width, out.height]).toEqual([490, 390])
    expect(pixel(out, 2, 2)).toEqual([244, 241, 233]) // paper
    expect(pixel(out, 30, 195)).toEqual([32, 31, 29]) // film edge
    expect(pixel(out, 245, 195)).toEqual([58, 110, 165]) // the photo
    expect(pixel(out, 45, 45)).toEqual([58, 110, 165]) // its top-left corner
    expect(pixel(out, 44, 44)).toEqual([32, 31, 29])
  })

  it('makes the frame thicker or thinner', async () => {
    const registry = await createRegistry({ bundled })
    const thin = await registry.apply(await raster(400, 300), [step({ thickness: 2 })])
    const thick = await registry.apply(await raster(400, 300), [step({ thickness: 14 })])
    expect(thin.width).toBe(400 + 2 * (6 + 3))
    expect(thick.width).toBe(400 + 2 * (42 + 21))
  })

  it('makes the outer edge ragged, or leaves it straight', async () => {
    const registry = await createRegistry({ bundled })
    const edgeProfile = (r: Raster) => {
      // For each column, how far down the first black pixel is.
      const profile: number[] = []
      for (let x = 60; x < r.width - 60; x += 4) {
        let y = 0
        while (y < r.height && pixel(r, x, y)[0]! > 128) y++
        profile.push(y)
      }
      return profile
    }
    const straight = edgeProfile(await registry.apply(await raster(600, 400), [step({ thickness: 10, raggedness: 0, markings: false, sprockets: false })]))
    const ragged = edgeProfile(await registry.apply(await raster(600, 400), [step({ thickness: 10, raggedness: 100, markings: false, sprockets: false })]))
    expect(new Set(straight).size).toBe(1)
    expect(new Set(ragged).size).toBeGreaterThan(3)
    expect(Math.min(...ragged)).toBeGreaterThan(0) // the wandering edge stays on the paper
  })

  it('prints edge markings only when asked', async () => {
    const registry = await createRegistry({ bundled })
    const lightInBand = (r: Raster) => {
      let light = 0
      for (let y = 36; y < 86; y++) for (let x = 100; x < r.width - 100; x++) if (pixel(r, x, y)[0]! > 150) light++
      return light
    }
    const off = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: false, sprockets: false })])
    const on = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: true, sprockets: false })])
    expect(lightInBand(off)).toBe(0)
    expect(lightInBand(on)).toBeGreaterThan(200)
  })

  it('gives the same photo the same frame every time', async () => {
    const registry = await createRegistry({ bundled })
    const a = await registry.apply(await raster(500, 500), [step()])
    const b = await registry.apply(await raster(500, 500), [step()])
    expect(a.data.equals(b.data)).toBe(true)
  })

  it('uses only invented stock names', () => {
    const stocks = (filmframe.transforms[0]!.params.stock as { options: string[] }).options
    expect(stocks).toEqual(['FOTOBOGEN 400', 'NACHTPAN 100', 'SILBERKORN 5063', 'BOGEN-X 320'])
    expect(stocks.join(' ')).not.toMatch(/KODAK|ILFORD|TRI-X|PLUS-X|HP5|FP4|FUJI|AGFA|T-MAX|DELTA/i)
  })
})

describe('the module registry', () => {
  it('lists bundled modules, enabled', async () => {
    const registry = await createRegistry({ bundled })
    expect(registry.list().map(m => [m.manifest.name, m.source, m.error])).toEqual([['filmframe', 'bundled', null], ['filmlooks', 'bundled', null]])
  })

  it('loads a module dropped into the data directory, with no build step', async () => {
    const dir = installed({
      invert: {
        'module.json': manifest('invert'),
        'index.mjs': `export default { transforms: [{ id: 'negative', label: 'Negative', params: {}, apply: image => image.negate() }] }`,
      },
    })
    const registry = await createRegistry({ bundled, installedDir: dir })
    expect(registry.list().map(m => [m.manifest.name, m.source, m.error])).toContainEqual(['invert', 'installed', null])
    const out = await registry.apply(await raster(10, 10, '#000000'), [{ module: 'invert', transform: 'negative', params: {} }])
    expect(pixel(out, 5, 5)).toEqual([255, 255, 255])
  })

  it('reports a broken module and carries on with the others', async () => {
    const dir = installed({
      'throws': { 'module.json': manifest('throws'), 'index.mjs': `throw new Error('boom at load')` },
      'no-entry': { 'module.json': manifest('no-entry') },
      'wrong-name': { 'module.json': manifest('something-else'), 'index.mjs': 'export default {}' },
      'bad-shape': { 'module.json': manifest('bad-shape'), 'index.mjs': 'export default { transforms: [] }' },
      'filmframe': { 'module.json': manifest('filmframe'), 'index.mjs': `export default { transforms: [{ id: 'negative-edge', label: 'Impostor', apply: i => i.negate() }] }` },
    })
    const registry = await createRegistry({ bundled, installedDir: dir })
    const byName = Object.fromEntries(registry.list().map(m => [m.manifest.name, m]))
    expect(byName.throws!.error).toBe('boom at load')
    expect(byName['no-entry']!.error).toMatch(/entry file index.mjs is missing/)
    expect(byName['something-else']!.error).toMatch(/must match/)
    expect(byName['bad-shape']!.error).toMatch(/at least one transform/)
    // A folder cannot take the place of a bundled module.
    expect(byName.filmframe).toMatchObject({ source: 'bundled', error: null })
    expect(byName.filmframe!.transforms[0]!.label).toBe('Negative edge')
  })

  it('cleans a recipe: unknown steps dropped, parameters made valid, length capped', async () => {
    const registry = await createRegistry({ bundled })
    expect(registry.cleanRecipe([
      { module: 'filmframe', transform: 'negative-edge', params: { thickness: -5, stock: 'nope' } },
      { module: 'ghost', transform: 'x', params: {} },
      { module: 'filmframe', transform: 'no-such-transform' },
      'garbage',
    ])).toEqual([{ module: 'filmframe', transform: 'negative-edge', params: { thickness: 2, raggedness: 60, markings: true, sprockets: true, stock: 'FOTOBOGEN 400', sharpen: 0 } }])
    expect(registry.cleanRecipe('not a list')).toEqual([])
    expect(registry.cleanRecipe(Array.from({ length: 20 }, () => step()))).toHaveLength(8)
  })

  it('skips the steps of a disabled module, remembers the switch, and says which steps were skipped', async () => {
    const ctx = testContext()
    const registry = await createRegistry({ bundled, sqlite: ctx.sqlite })
    // Every module starts switched off.
    expect(rows(ctx, 'select name, enabled from modules order by name')).toEqual([{ name: 'filmframe', enabled: 0 }, { name: 'filmlooks', enabled: 0 }])
    expect(registry.list().every(module => !module.enabled)).toBe(true)
    expect(registry.setEnabled('filmframe', true)).toBe(true)
    expect((await registry.apply(await raster(100, 80), [step()])).width).toBeGreaterThan(100)
    expect(registry.setEnabled('filmframe', false)).toBe(true)
    expect(registry.setEnabled('ghost', false)).toBe(false)
    const untouched = await registry.apply(await raster(100, 80), [step()])
    expect([untouched.width, untouched.height]).toEqual([100, 80])
    expect(registry.skipped([step()])).toHaveLength(1)
    // Still off after a restart.
    const again = await createRegistry({ bundled, sqlite: ctx.sqlite })
    again.setEnabled('filmlooks', true)
    const third = await createRegistry({ bundled, sqlite: ctx.sqlite })
    expect(third.list().map(module => [module.manifest.name, module.enabled])).toEqual([['filmframe', false], ['filmlooks', true]])
  })

  it('stops a transform that returns an absurdly large picture', async () => {
    const dir = installed({
      huge: { 'module.json': manifest('huge'), 'index.mjs': `export default { transforms: [{ id: 'grow', label: 'Grow', apply: image => image.resize(9000, 9000, { fit: 'fill' }) }] }` },
    })
    const registry = await createRegistry({ bundled, installedDir: dir })
    await expect(registry.apply(await raster(10, 10), [{ module: 'huge', transform: 'grow', params: {} }])).rejects.toThrow(/too large/)
  })
})

describe('the film frame as a contact print', () => {
  it('punches sprocket holes, darker than the film base, along the top and bottom', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: false, sprockets: true })])
    // Border 60, paper 30. Holes sit in the 22 px nearest the photo, top and bottom.
    const blackIn = (from: number, to: number) => {
      let black = 0
      for (let y = from; y < to; y++) for (let x = 100; x < out.width - 100; x++) if (pixel(out, x, y)[0] === 0) black++
      return black
    }
    expect(blackIn(60, 84)).toBeGreaterThan(2000) // top row of holes
    expect(blackIn(out.height - 84, out.height - 60)).toBeGreaterThan(2000) // bottom row
    expect(blackIn(32, 56)).toBe(0) // outer part of the edge is plain film base
    const without = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: false, sprockets: false })])
    expect([without.width, without.height]).toEqual([out.width, out.height])
  })
})

describe('the film looks module', () => {
  const look = (name: string, grain = 100) => ({ module: 'filmlooks', transform: 'film-look', params: { look: name, grain } as never })
  const stats = (r: Raster) => {
    let sum = 0, sumSquares = 0, colour = 0
    const count = r.width * r.height
    for (let i = 0; i < count; i++) {
      const [red, green, blue] = [r.data[i * r.channels]!, r.data[i * r.channels + 1]!, r.data[i * r.channels + 2]!]
      sum += green
      sumSquares += green * green
      colour += Math.max(red, green, blue) - Math.min(red, green, blue)
    }
    const mean = sum / count
    return { mean, deviation: Math.sqrt(sumSquares / count - mean * mean), colour: colour / count }
  }

  it('offers looks described by style, with grain that can be turned down or up', () => {
    const params = filmlooks.transforms[0]!.params as Record<string, { options?: string[], min?: number, max?: number, default: unknown }>
    expect(params.look!.options).toEqual([
      'B&W 400 (Tri-X style)', 'B&W 400 pushed, heavy grain (Tri-X style)', 'B&W 100, fine grain',
      'Colour slide (Kodachrome style)', 'Colour negative, soft',
    ])
    expect([params.grain!.min, params.grain!.max, params.grain!.default]).toEqual([0, 200, 100])
  })

  it('sharpens: normal by default, none at 0, crisp when turned up, and never sharpens the grain', async () => {
    const params = filmlooks.transforms[0]!.params as Record<string, { min?: number, max?: number, default: unknown }>
    expect([params.sharpen!.min, params.sharpen!.max, params.sharpen!.default]).toEqual([0, 100, 25])
    // The frame and the watermark can sharpen too, but leave the photo alone unless asked.
    expect((filmframe.transforms[0]!.params as Record<string, { default: unknown }>).sharpen!.default).toBe(0)

    // A soft edge between two greys. Sharpening makes each side overshoot next to the edge.
    const width = 200, height = 60
    const edge = Buffer.alloc(width * height * 3)
    for (let i = 0; i < width * height; i++) edge.fill(i % width < width / 2 ? 96 : 160, i * 3, i * 3 + 3)
    const { data, info } = await sharp(edge, { raw: { width, height, channels: 3 } }).blur(1.5).raw().toBuffer({ resolveWithObject: true })
    const soft: Raster = { data, width: info.width, height: info.height, channels: info.channels }
    const registry = await createRegistry({ bundled })
    const spread = async (sharpen: number) => {
      const out = await registry.apply(soft, [{ module: 'filmlooks', transform: 'film-look', params: { look: 'B&W 100, fine grain', grain: 0, sharpen } as never }])
      const row = Array.from({ length: width }, (_, x) => pixel(out, x, 30)[0]!)
      return Math.max(...row) - Math.min(...row)
    }
    const [none, normal, crisp] = [await spread(0), await spread(25), await spread(100)]
    expect(normal).toBeGreaterThan(none)
    expect(crisp).toBeGreaterThan(normal + 10)
    // On a flat grey there is nothing to sharpen, so grain alone decides the texture.
    const grey = await raster(300, 200, '#808080')
    const grain = async (sharpen: number) => stats(await registry.apply(grey, [{ module: 'filmlooks', transform: 'film-look', params: { look: 'B&W 400 (Tri-X style)', grain: 100, sharpen } as never }])).deviation
    expect(await grain(100)).toBeCloseTo(await grain(0), 5)
  })

  it('turns a colour photo black and white for the black-and-white looks, keeping its size', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(300, 200, '#b0503a'), [look('B&W 400 (Tri-X style)')])
    expect([out.width, out.height]).toEqual([300, 200])
    expect(stats(out).colour).toBe(0)
  })

  it('gives the pushed look much heavier grain than the fine one, and none at all when grain is off', async () => {
    const registry = await createRegistry({ bundled })
    const grey = await raster(400, 300, '#808080')
    const fine = stats(await registry.apply(grey, [look('B&W 100, fine grain')])).deviation
    const classic = stats(await registry.apply(grey, [look('B&W 400 (Tri-X style)')])).deviation
    const pushed = stats(await registry.apply(grey, [look('B&W 400 pushed, heavy grain (Tri-X style)')])).deviation
    expect(fine).toBeGreaterThan(0.5)
    expect(classic).toBeGreaterThan(fine * 1.5)
    expect(pushed).toBeGreaterThan(classic * 1.5)
    expect(stats(await registry.apply(grey, [look('B&W 400 pushed, heavy grain (Tri-X style)', 0)])).deviation).toBe(0)
    expect(stats(await registry.apply(grey, [look('B&W 400 (Tri-X style)', 200)])).deviation).toBeGreaterThan(classic * 1.5)
  })

  it('keeps colour for the slide look and makes it richer', async () => {
    const registry = await createRegistry({ bundled })
    const muted = await raster(200, 200, '#8a6a5a')
    const before = stats(muted).colour
    const slide = stats(await registry.apply(muted, [look('Colour slide (Kodachrome style)', 0)])).colour
    const soft = stats(await registry.apply(muted, [look('Colour negative, soft', 0)])).colour
    expect(slide).toBeGreaterThan(before * 1.15)
    expect(soft).toBeLessThan(before)
    expect(soft).toBeGreaterThan(0)
  })

  it('gives the same photo the same grain every time', async () => {
    const registry = await createRegistry({ bundled })
    const a = await registry.apply(await raster(200, 150), [look('B&W 400 (Tri-X style)')])
    const b = await registry.apply(await raster(200, 150), [look('B&W 400 (Tri-X style)')])
    expect(a.data.equals(b.data)).toBe(true)
  })

  it('works on a picture with transparency, and under the film frame', async () => {
    const registry = await createRegistry({ bundled })
    const { data, info } = await sharp({ create: { width: 120, height: 90, channels: 4, background: { r: 200, g: 60, b: 60, alpha: 0.5 } } }).raw().toBuffer({ resolveWithObject: true })
    const out = await registry.apply({ data, width: info.width, height: info.height, channels: info.channels }, [look('B&W 100, fine grain'), step()])
    expect(out.width).toBeGreaterThan(120)
  })
})
