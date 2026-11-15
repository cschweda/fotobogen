import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import filmframe from '../../modules/filmframe/index.mjs'
import filmframeManifest from '../../modules/filmframe/module.json'
import { checkDefinition, checkManifest, coerceParams } from '../../server/modules/contract.ts'
import { createRegistry, type Raster } from '../../server/modules/registry.ts'
import { testContext, rows } from '../helpers/pipeline.ts'

const bundled = [{ manifest: filmframeManifest, definition: filmframe }]

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
      thickness: 14, raggedness: 60, markings: true, stock: 'FOTOBOGEN 400',
    })
    expect(coerceParams(specs, undefined)).toEqual({ thickness: 6, raggedness: 60, markings: true, stock: 'FOTOBOGEN 400' })
  })
})

describe('the film frame module', () => {
  it('surrounds the photo with a black edge on white paper, leaving the photo itself untouched', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(400, 300), [step({ thickness: 10, raggedness: 0, markings: false })])
    // 10% of the shorter side is a 30 px border, plus 15 px of paper, on every side.
    expect([out.width, out.height]).toEqual([490, 390])
    expect(pixel(out, 2, 2)).toEqual([244, 241, 233]) // paper
    expect(pixel(out, 30, 195)).toEqual([11, 11, 11]) // film edge
    expect(pixel(out, 245, 195)).toEqual([58, 110, 165]) // the photo
    expect(pixel(out, 45, 45)).toEqual([58, 110, 165]) // its top-left corner
    expect(pixel(out, 44, 44)).toEqual([11, 11, 11])
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
    const straight = edgeProfile(await registry.apply(await raster(600, 400), [step({ thickness: 10, raggedness: 0, markings: false })]))
    const ragged = edgeProfile(await registry.apply(await raster(600, 400), [step({ thickness: 10, raggedness: 100, markings: false })]))
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
    const off = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: false })])
    const on = await registry.apply(await raster(900, 600), [step({ thickness: 10, raggedness: 0, markings: true })])
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
    expect(registry.list().map(m => [m.manifest.name, m.source, m.enabled, m.error])).toEqual([['filmframe', 'bundled', true, null]])
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
    ])).toEqual([{ module: 'filmframe', transform: 'negative-edge', params: { thickness: 2, raggedness: 60, markings: true, stock: 'FOTOBOGEN 400' } }])
    expect(registry.cleanRecipe('not a list')).toEqual([])
    expect(registry.cleanRecipe(Array.from({ length: 20 }, () => step()))).toHaveLength(8)
  })

  it('skips the steps of a disabled module, remembers the switch, and says which steps were skipped', async () => {
    const ctx = testContext()
    const registry = await createRegistry({ bundled, sqlite: ctx.sqlite })
    expect(rows(ctx, 'select name, version, enabled from modules')).toEqual([{ name: 'filmframe', version: '1.0.0', enabled: 1 }])
    expect(registry.setEnabled('filmframe', false)).toBe(true)
    expect(registry.setEnabled('ghost', false)).toBe(false)
    const untouched = await registry.apply(await raster(100, 80), [step()])
    expect([untouched.width, untouched.height]).toEqual([100, 80])
    expect(registry.skipped([step()])).toHaveLength(1)
    // Still off after a restart.
    const again = await createRegistry({ bundled, sqlite: ctx.sqlite })
    expect(again.list()[0]!.enabled).toBe(false)
  })

  it('stops a transform that returns an absurdly large picture', async () => {
    const dir = installed({
      huge: { 'module.json': manifest('huge'), 'index.mjs': `export default { transforms: [{ id: 'grow', label: 'Grow', apply: image => image.resize(9000, 9000, { fit: 'fill' }) }] }` },
    })
    const registry = await createRegistry({ bundled, installedDir: dir })
    await expect(registry.apply(await raster(10, 10), [{ module: 'huge', transform: 'grow', params: {} }])).rejects.toThrow(/too large/)
  })
})
