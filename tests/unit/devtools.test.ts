import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { scaffoldModule, testModule } from '../../server/modules/devtools.ts'
import { imageFile } from '../helpers/images.ts'

const temp = () => mkdtempSync(join(tmpdir(), 'fb-devtools-'))
function moduleIn(dir: string, name: string, code: string, manifest: Record<string, unknown> = {}) {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, 'module.json'), JSON.stringify({ name, version: '1.0.0', label: name, entry: 'index.mjs', ...manifest }))
  writeFileSync(join(dir, name, 'index.mjs'), code)
  return join(dir, name)
}

describe('starting a module', () => {
  it('creates a folder with a manifest and a working example', async () => {
    const dir = temp()
    const folder = scaffoldModule(dir, 'warm-tone')
    expect(readdirSync(folder).sort()).toEqual(['index.mjs', 'module.json'])
    expect(JSON.parse(readFileSync(join(folder, 'module.json'), 'utf8'))).toMatchObject({ name: 'warm-tone', label: 'Warm Tone', entry: 'index.mjs' })
    // What it creates passes its own test.
    const result = await testModule(folder, { outDir: join(dir, 'out') })
    expect(result.lines.filter(line => !line.ok)).toEqual([])
    expect(result.ok).toBe(true)
  })
  it('refuses a bad name, and will not overwrite a module', () => {
    const dir = temp()
    expect(() => scaffoldModule(dir, 'Warm Tone')).toThrow(/lowercase letters/)
    expect(() => scaffoldModule(dir, '../escape')).toThrow(/lowercase letters/)
    scaffoldModule(dir, 'mine')
    expect(() => scaffoldModule(dir, 'mine')).toThrow(/already something/)
  })
})

describe('trying a module', () => {
  it('runs every transform at a large and a small size and writes the results to look at', async () => {
    const dir = temp()
    const folder = moduleIn(dir, 'mono', `export default { transforms: [{ id: 'grey', label: 'Grey', params: {}, apply: image => image.greyscale() }] }`)
    const result = await testModule(folder, { outDir: join(dir, 'out') })
    expect(result.ok).toBe(true)
    expect(result.lines.map(line => line.text)).toEqual([
      'module.json: "mono", version 1.0.0',
      'index.mjs: 1 transform (grey)',
      'grey at 2560 px: 1200 x 800',
      'grey at 2560 px: the same result twice',
      'grey at 240 px: 240 x 160',
      'grey at 240 px: the same result twice',
    ])
    expect(result.written.map(file => file.split(/[\\/]/).pop())).toEqual(['mono-grey-2560.webp', 'mono-grey-240.webp'])
    expect((await sharp(result.written[1]!).metadata()).width).toBe(240)
  })
  it('uses your own photo when given one', async () => {
    const dir = temp()
    const photo = await imageFile(join(dir, 'mine.jpg'), { width: 900, height: 300 })
    const folder = moduleIn(dir, 'mono', `export default { transforms: [{ id: 'grey', label: 'Grey', params: {}, apply: image => image.greyscale() }] }`)
    const result = await testModule(folder, { image: photo, outDir: join(dir, 'out') })
    expect(result.lines[2]!.text).toBe('grey at 2560 px: 900 x 300')
  })
  it('says what is wrong with a module that would not load', async () => {
    const dir = temp()
    const out = join(dir, 'out')
    expect((await testModule(moduleIn(dir, 'noapply', `export default { transforms: [{ id: 'a', label: 'A' }] }`), { outDir: out })).lines.at(-1)).toEqual({ ok: false, text: 'Transform "a" needs an "apply" function.' })
    expect((await testModule(moduleIn(dir, 'throws', `throw new Error('boom at load')`), { outDir: out })).lines.at(-1)).toEqual({ ok: false, text: 'boom at load' })
    expect((await testModule(moduleIn(dir, 'renamed', `export default { transforms: [] }`, { name: 'other' }), { outDir: out })).lines.at(-1)!.text).toMatch(/must match/)
    expect((await testModule(join(dir, 'nothing-here'), { outDir: out })).ok).toBe(false)
    expect(existsSync(out)).toBe(false) // nothing written for modules that never ran
  })
  it('catches a transform that fails, or gives a different picture each time', async () => {
    const dir = temp()
    const failing = await testModule(moduleIn(dir, 'failing', `export default { transforms: [{ id: 'bad', label: 'Bad', params: {}, apply: () => { throw new Error('no such thing') } }] }`), { outDir: join(dir, 'out') })
    expect(failing.ok).toBe(false)
    expect(failing.lines.at(-1)).toEqual({ ok: false, text: 'bad at 240 px: no such thing' })
    const random = await testModule(moduleIn(dir, 'random', `export default { transforms: [{ id: 'noise', label: 'Noise', params: {}, apply: image => image.modulate({ brightness: 0.8 + Math.random() * 0.4 }) }] }`), { outDir: join(dir, 'out') })
    expect(random.ok).toBe(false)
    expect(random.lines.some(line => !line.ok && line.text.includes('a different result the second time'))).toBe(true)
  })
  it('passes the three modules that come with Fotobogen', async () => {
    const out = join(temp(), 'out')
    for (const name of ['filmframe', 'filmlooks', 'watermark']) {
      const result = await testModule(join('modules', name), { outDir: out })
      expect(result.lines.filter(line => !line.ok), name).toEqual([])
    }
  })
})
