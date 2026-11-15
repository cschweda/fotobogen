// What a module is (DESIGN.md section 10).
//
// A module is a folder with a `module.json` and an ES module entry point.
// It contributes named transforms. Each transform declares its parameters
// as a small schema, from which the admin builds the controls, and an
// `apply` function that changes the picture. Nothing about the admin has to
// be rebuilt when a module is added: the admin reads these declarations
// from the server at run time.
import type { Sharp, SharpOptions } from 'sharp'

export type ParamSpec
  = | { type: 'range', label?: string, min: number, max: number, step?: number, default: number }
    | { type: 'select', label?: string, options: string[], default: string }
    | { type: 'boolean', label?: string, default: boolean }
    | { type: 'text', label?: string, default: string, maxLength?: number }

export type ParamValue = number | string | boolean
export type Params = Record<string, ParamValue>

export interface TransformContext {
  /** Pixel size of the picture handed to `apply`. */
  width: number
  height: number
  /**
   * The image library, so a module needs no dependencies of its own.
   * Typical use: build a new canvas and composite the picture onto it.
   */
  sharp: (input?: Buffer | Uint8Array | string, options?: SharpOptions) => Sharp
}

export interface Transform {
  id: string
  label: string
  description?: string
  params: Record<string, ParamSpec>
  /**
   * Receives the picture as a sharp pipeline and returns one (or a promise
   * of one). It may change the picture's size. It must not read or write
   * files or use the network.
   */
  apply(image: Sharp, params: Params, context: TransformContext): Sharp | Promise<Sharp>
}

export interface ModuleDefinition {
  transforms: Transform[]
}

export interface ModuleManifest {
  name: string
  version: string
  label: string
  description?: string
  entry: string
}

/** One step of a photo's recipe, as stored in `photos.recipe_json`. */
export interface RecipeStep {
  module: string
  transform: string
  params: Params
}

/** Identity function: gives module authors type checking and a familiar shape. */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition
}

/** The longest text a module may ask for. */
const TEXT_LIMIT = 200
const NAME = /^[a-z][a-z0-9-]{0,39}$/
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function checkManifest(value: unknown): ModuleManifest {
  if (!isRecord(value)) throw new Error('module.json must be a JSON object.')
  const { name, version, label, entry, description } = value
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('module.json needs a "name" of lowercase letters, digits, and hyphens.')
  if (typeof version !== 'string' || !version) throw new Error('module.json needs a "version".')
  if (typeof label !== 'string' || !label) throw new Error('module.json needs a "label".')
  if (typeof entry !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*\.m?js$/.test(entry)) {
    throw new Error('module.json needs an "entry": the file name of a .mjs or .js file in the module folder.')
  }
  return { name, version, label, entry, description: typeof description === 'string' ? description : undefined }
}

function checkParam(key: string, spec: unknown): ParamSpec {
  if (!isRecord(spec)) throw new Error(`Parameter "${key}" must be an object.`)
  const label = typeof spec.label === 'string' ? spec.label : undefined
  if (spec.type === 'range') {
    const { min, max, step, default: fallback } = spec
    if (![min, max, fallback].every(n => typeof n === 'number' && Number.isFinite(n)) || (min as number) >= (max as number)) {
      throw new Error(`Range parameter "${key}" needs numeric min, max, and default, with min below max.`)
    }
    return { type: 'range', label, min: min as number, max: max as number, step: typeof step === 'number' && step > 0 ? step : undefined, default: fallback as number }
  }
  if (spec.type === 'select') {
    const { options, default: fallback } = spec
    if (!Array.isArray(options) || options.length === 0 || !options.every(option => typeof option === 'string') || typeof fallback !== 'string' || !options.includes(fallback)) {
      throw new Error(`Select parameter "${key}" needs a list of text options and a default that is one of them.`)
    }
    return { type: 'select', label, options: options as string[], default: fallback as string }
  }
  if (spec.type === 'boolean') {
    if (typeof spec.default !== 'boolean') throw new Error(`Boolean parameter "${key}" needs a true or false default.`)
    return { type: 'boolean', label, default: spec.default }
  }
  if (spec.type === 'text') {
    if (typeof spec.default !== 'string') throw new Error(`Text parameter "${key}" needs a text default (it may be empty).`)
    const maxLength = typeof spec.maxLength === 'number' && spec.maxLength > 0 ? Math.min(TEXT_LIMIT, Math.floor(spec.maxLength)) : 80
    return { type: 'text', label, default: spec.default.slice(0, maxLength), maxLength }
  }
  throw new Error(`Parameter "${key}" has an unknown type. Use "range", "select", "boolean", or "text".`)
}

/** Checks what a module's entry point exported. Throws with a message for the admin. */
export function checkDefinition(value: unknown): ModuleDefinition {
  if (!isRecord(value) || !Array.isArray(value.transforms) || value.transforms.length === 0) {
    throw new Error('The module must export { transforms: [...] } with at least one transform.')
  }
  const seen = new Set<string>()
  const transforms = value.transforms.map((raw: unknown): Transform => {
    if (!isRecord(raw)) throw new Error('Each transform must be an object.')
    const { id, label, description, params, apply } = raw
    if (typeof id !== 'string' || !NAME.test(id)) throw new Error('Each transform needs an "id" of lowercase letters, digits, and hyphens.')
    if (seen.has(id)) throw new Error(`Two transforms share the id "${id}".`)
    seen.add(id)
    if (typeof label !== 'string' || !label) throw new Error(`Transform "${id}" needs a "label".`)
    if (typeof apply !== 'function') throw new Error(`Transform "${id}" needs an "apply" function.`)
    if (params !== undefined && !isRecord(params)) throw new Error(`Transform "${id}": "params" must be an object.`)
    const checked: Record<string, ParamSpec> = {}
    for (const [key, spec] of Object.entries(params ?? {})) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)) throw new Error(`Transform "${id}": parameter names are letters and digits, starting with a letter.`)
      checked[key] = checkParam(key, spec)
    }
    return { id, label, description: typeof description === 'string' ? description : undefined, params: checked, apply: apply as Transform['apply'] }
  })
  return { transforms }
}

/**
 * Makes a complete, valid set of parameters from whatever was sent:
 * unknown keys dropped, numbers clamped, anything invalid replaced by the
 * default. A module's `apply` can therefore trust its parameters.
 */
export function coerceParams(specs: Record<string, ParamSpec>, given: unknown): Params {
  const input = isRecord(given) ? given : {}
  const params: Params = {}
  for (const [key, spec] of Object.entries(specs)) {
    const value = input[key]
    if (spec.type === 'range') {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : spec.default
      params[key] = Math.min(spec.max, Math.max(spec.min, number))
    }
    else if (spec.type === 'select') {
      params[key] = typeof value === 'string' && spec.options.includes(value) ? value : spec.default
    }
    else if (spec.type === 'text') {
      // One line of plain text: control characters out, length capped.
      // eslint-disable-next-line no-control-regex
      params[key] = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, spec.maxLength ?? 80) : spec.default
    }
    else {
      params[key] = typeof value === 'boolean' ? value : spec.default
    }
  }
  return params
}
