import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import watermark from '../../modules/watermark/index.mjs'
import watermarkManifest from '../../modules/watermark/module.json'
import { checkDefinition, coerceParams } from '../../server/modules/contract.ts'
import { createRegistry, type Raster } from '../../server/modules/registry.ts'

const bundled = [{ manifest: watermarkManifest, definition: watermark }]
async function raster(width: number, height: number, colour = '#404040'): Promise<Raster> {
  const { data, info } = await sharp({ create: { width, height, channels: 3, background: colour } }).raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}
const mark = (params: Record<string, unknown>) => ({ module: 'watermark', transform: 'text-mark', params: params as never })
/** Counts pixels that differ from the plain background, in a region. */
function changed(r: Raster, left: number, top: number, right: number, bottom: number, background = 0x40): number {
  let count = 0
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (r.data[(y * r.width + x) * r.channels] !== background) count++
  return count
}

describe('a text parameter', () => {
  const specs = checkDefinition(watermark).transforms[0]!.params
  it('is declared with a default and a length limit', () => {
    expect(specs.text).toEqual({ type: 'text', label: expect.any(String), default: '(C) YOUR NAME', maxLength: 60 })
    expect(() => checkDefinition({ transforms: [{ id: 'a', label: 'A', apply() {}, params: { note: { type: 'text' } } }] })).toThrow(/needs a text default/)
  })
  it('is kept to one plain line of the allowed length', () => {
    expect(coerceParams(specs, { text: 'x'.repeat(100) }).text).toHaveLength(60)
    expect(coerceParams(specs, { text: 'one\ntwo\u0000three' }).text).toBe('one two three')
    expect(coerceParams(specs, { text: 42 }).text).toBe('(C) YOUR NAME')
    expect(coerceParams(specs, { text: '' }).text).toBe('')
  })
})

describe('the watermark module', () => {
  it('prints the text in the chosen corner and nowhere else, keeping the photo its size', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(800, 600), [mark({ text: 'ANSEL', position: 'bottom right', size: 3, opacity: 100 })])
    expect([out.width, out.height]).toEqual([800, 600])
    expect(changed(out, 400, 300, 800, 600)).toBeGreaterThan(300) // bottom right quarter
    expect(changed(out, 0, 0, 400, 300)).toBe(0)
    expect(changed(out, 0, 300, 400, 600)).toBe(0)
    const topLeft = await registry.apply(await raster(800, 600), [mark({ text: 'ANSEL', position: 'top left', size: 3, opacity: 100 })])
    expect(changed(topLeft, 0, 0, 400, 300)).toBeGreaterThan(300)
    expect(changed(topLeft, 400, 300, 800, 600)).toBe(0)
  })
  it('can be light or dark, and fainter', async () => {
    const registry = await createRegistry({ bundled })
    const brightest = (r: Raster) => Math.max(...r.data.filter((_, index) => index % r.channels === 0))
    const darkest = (r: Raster) => Math.min(...r.data.filter((_, index) => index % r.channels === 0))
    const light = await registry.apply(await raster(400, 300), [mark({ text: 'A', colour: 'light', opacity: 100, size: 6 })])
    const faint = await registry.apply(await raster(400, 300), [mark({ text: 'A', colour: 'light', opacity: 20, size: 6 })])
    const dark = await registry.apply(await raster(400, 300, '#c0c0c0'), [mark({ text: 'A', colour: 'dark', opacity: 100, size: 6 })])
    expect(brightest(light)).toBeGreaterThan(230)
    expect(brightest(faint)).toBeGreaterThan(0x40)
    expect(brightest(faint)).toBeLessThan(brightest(light) - 80)
    expect(darkest(dark)).toBeLessThan(30)
  })
  it('shrinks a long line to fit instead of cutting it off', async () => {
    const registry = await createRegistry({ bundled })
    const out = await registry.apply(await raster(300, 200), [mark({ text: 'A VERY LONG LINE OF TEXT THAT WOULD NOT FIT AT THIS SIZE', size: 6, opacity: 100, position: 'centre' })])
    // Nothing touches the outer 3% on either side.
    expect(changed(out, 0, 0, 9, 200)).toBe(0)
    expect(changed(out, 291, 0, 300, 200)).toBe(0)
    expect(changed(out, 0, 0, 300, 200)).toBeGreaterThan(50)
  })
  it('leaves the photo alone when there is no text, and draws unknown characters as spaces', async () => {
    const registry = await createRegistry({ bundled })
    const none = await registry.apply(await raster(200, 150), [mark({ text: '   ' })])
    expect(changed(none, 0, 0, 200, 150)).toBe(0)
    const odd = await registry.apply(await raster(200, 150), [mark({ text: '写真', opacity: 100 })])
    expect(changed(odd, 0, 0, 200, 150)).toBe(0)
    const copyright = await registry.apply(await raster(400, 300), [mark({ text: '© 2026 ansel', opacity: 100 })])
    expect(changed(copyright, 0, 0, 400, 300)).toBeGreaterThan(100) // lower case and © are drawn
  })
  it('sits on top of the film frame when both are used', async () => {
    const filmframe = (await import('../../modules/filmframe/index.mjs')).default
    const manifest = (await import('../../modules/filmframe/module.json')).default
    const registry = await createRegistry({ bundled: [{ manifest, definition: filmframe }, ...bundled] })
    const out = await registry.apply(await raster(400, 300), [{ module: 'filmframe', transform: 'negative-edge', params: {} as never }, mark({ text: 'ANSEL', opacity: 100 })])
    expect(out.width).toBeGreaterThan(400)
  })
})
