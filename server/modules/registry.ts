// Finds modules, checks them, and applies recipes (DESIGN.md section 10).
//
// Bundled modules are part of the build. Modules the site owner installs
// live in data/modules/<name>/ and are loaded when the server starts; no
// rebuild is involved. A module that fails to load is reported and left
// out; the site still starts.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Database } from 'better-sqlite3'
import type { Sharp } from 'sharp'
import { config } from '../core/config.ts'
import sharp from '../pipeline/image.ts'
import {
  checkDefinition, checkManifest, coerceParams,
  type ModuleDefinition, type ModuleManifest, type RecipeStep, type Transform,
} from './contract.ts'

export interface LoadedModule {
  manifest: ModuleManifest
  source: 'bundled' | 'installed'
  transforms: Transform[]
  enabled: boolean
  /** Why the module could not be used, when it could not. */
  error: string | null
}

export interface BundledModule {
  manifest: unknown
  definition: unknown
}

export interface Raster {
  data: Buffer
  width: number
  height: number
  channels: 1 | 2 | 3 | 4
}

export interface Registry {
  list(): LoadedModule[]
  setEnabled(name: string, enabled: boolean): boolean
  /** A recipe with every step checked and its parameters made valid. Steps naming unknown transforms are dropped. */
  cleanRecipe(recipe: unknown): RecipeStep[]
  /** Steps of the recipe that cannot run right now (module missing, failed, or disabled). */
  skipped(recipe: RecipeStep[]): RecipeStep[]
  /** Runs the recipe over a picture. Steps that cannot run are skipped. */
  apply(raster: Raster, recipe: RecipeStep[]): Promise<Raster>
}

const MAX_STEPS = 8
/** A transform may grow the picture (a border), but not without limit. */
const MAX_OUTPUT_PIXELS = config.internals.moduleOutputMegapixels * 1_000_000

function failed(manifest: ModuleManifest, source: LoadedModule['source'], error: unknown): LoadedModule {
  return { manifest, source, transforms: [], enabled: false, error: error instanceof Error ? error.message : String(error) }
}

async function loadInstalled(dir: string, folder: string, sqliteGiven: boolean): Promise<LoadedModule> {
  const fallback: ModuleManifest = { name: folder, version: '?', label: folder, entry: '' }
  let manifest = fallback
  try {
    manifest = checkManifest(JSON.parse(readFileSync(join(dir, folder, 'module.json'), 'utf8')))
    if (manifest.name !== folder) throw new Error(`The folder is called "${folder}" but module.json names the module "${manifest.name}". They must match.`)
    const entry = join(dir, folder, manifest.entry)
    if (!existsSync(entry)) throw new Error(`The entry file ${manifest.entry} is missing.`)
    // The module's own file, not a link to code somewhere else on the server.
    if (!lstatSync(entry).isFile()) throw new Error(`The entry file ${manifest.entry} must be a file in the module's folder, not a link.`)
    const imported = await import(/* @vite-ignore */ pathToFileURL(entry).href) as { default?: unknown }
    const definition: ModuleDefinition = checkDefinition(imported.default)
    return { manifest, source: 'installed', transforms: definition.transforms, enabled: sqliteGiven === false, error: null }
  }
  catch (error) {
    return failed(manifest === fallback ? { ...fallback, name: /^[a-z][a-z0-9-]{0,39}$/.test(folder) ? folder : 'invalid' } : manifest, 'installed', error)
  }
}

/**
 * With a database, modules start switched off and the admin's choices are
 * remembered there. Without one (tests, tools), every module is on.
 */
export async function createRegistry(options: { bundled: BundledModule[], installedDir?: string, sqlite?: Database }): Promise<Registry> {
  const modules = new Map<string, LoadedModule>()

  for (const bundled of options.bundled) {
    let manifest: ModuleManifest | undefined
    try {
      manifest = checkManifest(bundled.manifest)
      modules.set(manifest.name, { manifest, source: 'bundled', transforms: checkDefinition(bundled.definition).transforms, enabled: options.sqlite === undefined, error: null })
    }
    catch (error) {
      if (manifest) modules.set(manifest.name, failed(manifest, 'bundled', error))
    }
  }

  if (options.installedDir && existsSync(options.installedDir)) {
    const folders = readdirSync(options.installedDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    for (const folder of folders) {
      const loaded = await loadInstalled(options.installedDir, folder, options.sqlite !== undefined)
      if (modules.has(loaded.manifest.name)) {
        // A bundled module cannot be replaced by dropping in a folder of the same name.
        continue
      }
      modules.set(loaded.manifest.name, loaded)
    }
  }

  // Remember which modules the admin switched off, across restarts.
  const { sqlite } = options
  if (sqlite) {
    const known = new Map((sqlite.prepare(`select name, enabled from modules`).all() as { name: string, enabled: number }[]).map(row => [row.name, row.enabled === 1]))
    const upsert = sqlite.prepare(`insert into modules (name, version, enabled) values (?, ?, ?) on conflict(name) do update set version = excluded.version`)
    for (const module of modules.values()) {
      if (module.error) continue
      // Off until the admin switches a module on.
      module.enabled = known.get(module.manifest.name) ?? false
      upsert.run(module.manifest.name, module.manifest.version, module.enabled ? 1 : 0)
    }
  }

  const find = (step: RecipeStep): Transform | undefined => {
    const module = modules.get(step.module)
    return module && module.enabled && !module.error ? module.transforms.find(transform => transform.id === step.transform) : undefined
  }

  return {
    list: () => [...modules.values()],

    setEnabled(name, enabled) {
      const module = modules.get(name)
      if (!module || module.error) return false
      module.enabled = enabled
      sqlite?.prepare(`update modules set enabled = ? where name = ?`).run(enabled ? 1 : 0, name)
      return true
    },

    cleanRecipe(recipe) {
      if (!Array.isArray(recipe)) return []
      const steps: RecipeStep[] = []
      for (const raw of recipe.slice(0, MAX_STEPS)) {
        const step = raw as Partial<RecipeStep> | null
        const module = typeof step?.module === 'string' ? modules.get(step.module) : undefined
        const transform = module?.transforms.find(candidate => candidate.id === step?.transform)
        if (!module || !transform) continue
        steps.push({ module: module.manifest.name, transform: transform.id, params: coerceParams(transform.params, step?.params) })
      }
      return steps
    },

    skipped: recipe => recipe.filter(step => !find(step)),

    async apply(raster, recipe) {
      let current = raster
      for (const step of recipe) {
        const transform = find(step)
        if (!transform) continue
        const image = sharp(current.data, { raw: { width: current.width, height: current.height, channels: current.channels } })
        const result: Sharp = await transform.apply(image, coerceParams(transform.params, step.params), {
          width: current.width,
          height: current.height,
          sharp: (input, sharpOptions) => sharp(input as Buffer, { ...sharpOptions, limitInputPixels: MAX_OUTPUT_PIXELS }),
        })
        const out = await result.toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
        if (out.info.width * out.info.height > MAX_OUTPUT_PIXELS) {
          throw new Error(`The "${transform.label}" transform produced a picture that is too large.`)
        }
        current = { data: out.data, width: out.info.width, height: out.info.height, channels: out.info.channels }
      }
      return current
    },
  }
}
