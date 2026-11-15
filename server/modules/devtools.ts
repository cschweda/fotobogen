// Tools for people writing modules: a starting point, and a way to try a
// module from the command line before installing it on a site.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from '../pipeline/image.ts'
import { checkDefinition, checkManifest, coerceParams, type Transform } from './contract.ts'
import { createRegistry, type Raster } from './registry.ts'

const NAME = /^[a-z][a-z0-9-]{0,39}$/

/** Creates a small working module in `dir/<name>/`. Returns the folder, or throws with a reason. */
export function scaffoldModule(dir: string, name: string): string {
  if (!NAME.test(name)) throw new Error('A module\'s name is lowercase letters, digits, and hyphens, starting with a letter.')
  const folder = join(dir, name)
  if (existsSync(folder)) throw new Error(`There is already something at ${folder}.`)
  mkdirSync(folder, { recursive: true })
  const label = name.split('-').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ')
  writeFileSync(join(folder, 'module.json'), `${JSON.stringify({ name, version: '0.1.0', label, description: 'Describe what this module does.', entry: 'index.mjs' }, null, 2)}\n`)
  writeFileSync(join(folder, 'index.mjs'), `// ${label}: a Fotobogen module. See docs/MODULES.md.
//
// Try it without installing it:   pnpm fotobogen module test ${name}
// Install it on a site:           copy this folder into data/modules/ and restart.

export default {
  transforms: [
    {
      id: 'adjust',
      label: 'Adjust',
      description: 'Brightness and warmth.',
      // The admin builds one control for each of these.
      params: {
        brightness: { type: 'range', label: 'Brightness', min: 0.5, max: 1.5, step: 0.05, default: 1 },
        warmth: { type: 'range', label: 'Warmth', min: 0, max: 100, step: 5, default: 0 },
        fade: { type: 'boolean', label: 'Faded blacks', default: false },
      },
      // \`image\` is a sharp pipeline (https://sharp.pixelplumbing.com). Return one.
      // \`context\` has the photo's width and height, and \`sharp\` itself for
      // building new pictures. Work in proportions of the size, not in pixels:
      // the same settings are used on small previews and on large copies.
      apply(image, params, context) {
        let result = image.modulate({ brightness: params.brightness })
        if (params.warmth > 0) {
          const amount = params.warmth / 100
          result = result.recomb([[1 + 0.12 * amount, 0, 0], [0, 1, 0], [0, 0, 1 - 0.14 * amount]])
        }
        if (params.fade) result = result.linear(0.92, 16)
        return result
      },
    },
  ],
}
`)
  return folder
}

export interface ModuleTestResult {
  ok: boolean
  /** One line per thing checked, in order. */
  lines: { ok: boolean, text: string }[]
  /** Pictures written, for looking at. */
  written: string[]
}

async function testPicture(file: string | undefined, edge: number): Promise<Raster> {
  const source = file
    ? sharp(file).rotate()
    // No photo given: a picture with a bit of everything, light to dark and several colours.
    : sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#274b7a"/><stop offset="1" stop-color="#f2c38b"/></linearGradient>
        <linearGradient id="grey" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
        <rect width="1200" height="520" fill="url(#sky)"/><rect y="520" width="1200" height="200" fill="#3d5a36"/>
        <circle cx="880" cy="230" r="90" fill="#fff4d6"/><rect x="140" y="330" width="260" height="300" fill="#8a3b2e"/>
        <rect y="720" width="1200" height="80" fill="url(#grey)"/></svg>`))
  const { data, info } = await source.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

/**
 * Loads a module from a folder and runs every transform with its default
 * settings, at a large and a small size, twice each. Checks what the server
 * would check, plus that the result is the same every time, and writes the
 * results to `outDir` to be looked at.
 */
export async function testModule(folder: string, options: { image?: string, outDir: string }): Promise<ModuleTestResult> {
  const lines: ModuleTestResult['lines'] = []
  const written: string[] = []
  const say = (ok: boolean, text: string) => { lines.push({ ok, text }) }
  const finish = (): ModuleTestResult => ({ ok: lines.every(line => line.ok), lines, written })
  const dir = resolve(folder)

  let transforms: Transform[]
  let name: string
  try {
    const manifest = checkManifest(JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')))
    name = manifest.name
    if (manifest.name !== basename(dir)) throw new Error(`The folder is called "${basename(dir)}" but module.json names the module "${manifest.name}". They must match.`)
    say(true, `module.json: "${manifest.label}", version ${manifest.version}`)
    const entry = join(dir, manifest.entry)
    if (!existsSync(entry)) throw new Error(`The entry file ${manifest.entry} is missing.`)
    const imported = await import(`${pathToFileURL(entry).href}?t=${Date.now()}`) as { default?: unknown }
    transforms = checkDefinition(imported.default).transforms
    say(true, `${manifest.entry}: ${transforms.length} ${transforms.length === 1 ? 'transform' : 'transforms'} (${transforms.map(transform => transform.id).join(', ')})`)
  }
  catch (error) {
    say(false, error instanceof Error ? error.message : String(error))
    return finish()
  }

  mkdirSync(options.outDir, { recursive: true })
  const registry = await createRegistry({ bundled: [], installedDir: resolve(dir, '..') })
  for (const transform of transforms) {
    const step = [{ module: name, transform: transform.id, params: coerceParams(transform.params, {}) }]
    for (const edge of [2560, 240]) {
      const label = `${transform.id} at ${edge} px`
      try {
        const input = await testPicture(options.image, edge)
        const first = await registry.apply(input, step)
        const second = await registry.apply(input, step)
        if (first.width < 1 || first.height < 1) throw new Error('it produced an empty picture')
        const file = join(options.outDir, `${name}-${transform.id}-${edge}.webp`)
        await sharp(first.data, { raw: { width: first.width, height: first.height, channels: first.channels } }).webp({ quality: 85 }).toFile(file)
        written.push(file)
        say(true, `${label}: ${first.width} x ${first.height}`)
        say(first.data.equals(second.data), first.data.equals(second.data)
          ? `${label}: the same result twice`
          : `${label}: a different result the second time. Seed any randomness from the photo's size, or the picture changes every time it is rendered.`)
      }
      catch (error) {
        say(false, `${label}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return finish()
}
