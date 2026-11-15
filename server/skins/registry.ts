// Skins (DESIGN.md section 11). A skin is a folder with skin.json and
// skin.css. It restyles the public pages; it does not change their markup,
// so switching skins needs no rebuild. Bundled skins ship in the build;
// the site owner's go in data/skins/<name>/.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SkinOption
  = | { type: 'color', label?: string, default: string }
    | { type: 'select', label?: string, options: string[], default: string, values?: Record<string, string> }
    | { type: 'range', label?: string, min: number, max: number, step?: number, default: number }

export interface Skin {
  name: string
  version: string
  label: string
  description: string | null
  source: 'bundled' | 'installed'
  css: string
  /** Named colours the skin uses, for the contrast check. */
  tokens: Record<string, string>
  /** Pairs of token names that are text on a background. */
  contrast: [string, string][]
  options: Record<string, SkinOption>
  error: string | null
}

export type SkinValues = Record<string, string | number>
export interface SkinFiles { name: string, json: string, css: string }

const NAME = /^[a-z][a-z0-9-]{0,39}$/
const HEX = /^#[0-9a-f]{6}$/i
// What may appear in a value written into the stylesheet: no way to close
// the declaration or start another rule.
const CSS_VALUE = /^[A-Za-z0-9#%., ()-]{1,60}$/
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function parseOption(key: string, raw: unknown): SkinOption {
  if (!isRecord(raw)) throw new Error(`Option "${key}" must be an object.`)
  const label = typeof raw.label === 'string' ? raw.label : undefined
  if (raw.type === 'color') {
    if (typeof raw.default !== 'string' || !HEX.test(raw.default)) throw new Error(`Colour option "${key}" needs a default like "#e30613".`)
    return { type: 'color', label, default: raw.default }
  }
  if (raw.type === 'select') {
    const { options, default: fallback, values } = raw
    if (!Array.isArray(options) || !options.every(option => typeof option === 'string') || typeof fallback !== 'string' || !options.includes(fallback)) {
      throw new Error(`Select option "${key}" needs a list of text options and a default that is one of them.`)
    }
    const mapped: Record<string, string> = {}
    for (const option of options as string[]) {
      const value = isRecord(values) && typeof values[option] === 'string' ? values[option] as string : option
      if (!CSS_VALUE.test(value)) throw new Error(`Select option "${key}": "${value}" cannot be used as a CSS value.`)
      mapped[option] = value
    }
    return { type: 'select', label, options: options as string[], default: fallback, values: mapped }
  }
  if (raw.type === 'range') {
    const { min, max, step, default: fallback } = raw
    if (![min, max, fallback].every(n => typeof n === 'number' && Number.isFinite(n)) || (min as number) >= (max as number)) {
      throw new Error(`Range option "${key}" needs numeric min, max, and default, with min below max.`)
    }
    return { type: 'range', label, min: min as number, max: max as number, step: typeof step === 'number' && step > 0 ? step : undefined, default: fallback as number }
  }
  throw new Error(`Option "${key}" has an unknown type. Use "color", "select", or "range".`)
}

/** Reads one skin. A skin with a mistake in it is returned with `error` set, never thrown. */
export function parseSkin(files: SkinFiles, source: Skin['source']): Skin {
  const blank: Skin = { name: NAME.test(files.name) ? files.name : 'invalid', version: '?', label: files.name, description: null, source, css: '', tokens: {}, contrast: [], options: {}, error: null }
  try {
    const json = JSON.parse(files.json) as unknown
    if (!isRecord(json)) throw new Error('skin.json must be a JSON object.')
    if (typeof json.name !== 'string' || !NAME.test(json.name)) throw new Error('skin.json needs a "name" of lowercase letters, digits, and hyphens.')
    if (json.name !== files.name) throw new Error(`The folder is called "${files.name}" but skin.json names the skin "${json.name}". They must match.`)
    if (typeof json.version !== 'string' || !json.version) throw new Error('skin.json needs a "version".')
    if (typeof json.label !== 'string' || !json.label) throw new Error('skin.json needs a "label".')
    if (!files.css.trim()) throw new Error('skin.css is missing or empty.')

    const tokens: Record<string, string> = {}
    for (const [key, value] of Object.entries(isRecord(json.tokens) ? json.tokens : {})) {
      if (typeof value !== 'string' || !HEX.test(value)) throw new Error(`Token "${key}" must be a colour like "#0a0a0b".`)
      tokens[key] = value
    }
    const contrast = (Array.isArray(json.contrast) ? json.contrast : [])
      .filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && pair.every(name => typeof name === 'string'))
    const options: Record<string, SkinOption> = {}
    for (const [key, raw] of Object.entries(isRecord(json.options) ? json.options : {})) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(key)) throw new Error('Option names are lowercase letters, digits, and hyphens.')
      options[key] = parseOption(key, raw)
    }
    return { ...blank, name: json.name, version: json.version, label: json.label, description: typeof json.description === 'string' ? json.description : null, css: files.css, tokens, contrast, options }
  }
  catch (error) {
    return { ...blank, error: error instanceof Error ? error.message : String(error) }
  }
}

/** The skins in a directory such as data/skins: one folder each. */
export function readSkinFolders(dir: string): SkinFiles[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map((entry) => {
    const read = (file: string) => {
      try {
        return readFileSync(join(dir, entry.name, file), 'utf8')
      }
      catch {
        return ''
      }
    }
    return { name: entry.name, json: read('skin.json') || '{}', css: read('skin.css') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** Valid values for a skin's options: anything missing or invalid becomes the default. */
export function cleanValues(skin: Skin, given: unknown): SkinValues {
  const input = isRecord(given) ? given : {}
  const values: SkinValues = {}
  for (const [key, option] of Object.entries(skin.options)) {
    const value = input[key]
    if (option.type === 'color') values[key] = typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : option.default
    else if (option.type === 'select') values[key] = typeof value === 'string' && option.options.includes(value) ? value : option.default
    else values[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(option.max, Math.max(option.min, value)) : option.default
  }
  return values
}

/** The stylesheet a browser gets: the skin's own, then its options as custom-property overrides. */
export function renderCss(skin: Skin, values: SkinValues): string {
  const overrides = Object.entries(skin.options).map(([key, option]) => {
    const value = values[key] ?? option.default
    const css = option.type === 'select' ? option.values?.[String(value)] ?? String(value) : String(value)
    return `  --fb-${key}: ${css};`
  })
  return overrides.length > 0 ? `${skin.css}\n\n/* Options chosen in the admin. */\n:root.fb-public {\n${overrides.join('\n')}\n}\n` : skin.css
}

export const cssVersion = (css: string): string => createHash('sha256').update(css).digest('hex').slice(0, 10)

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Text-on-background pairs that fall below 4.5:1, with the chosen option colours applied. */
export function contrastWarnings(skin: Skin, values: SkinValues): string[] {
  const colours = { ...skin.tokens }
  for (const [key, option] of Object.entries(skin.options)) {
    if (option.type === 'color') colours[key] = String(values[key] ?? option.default)
  }
  const warnings: string[] = []
  for (const [text, ground] of skin.contrast) {
    if (!colours[text] || !colours[ground]) continue
    const ratio = contrastRatio(colours[text], colours[ground])
    if (ratio < 4.5) warnings.push(`"${text}" on "${ground}" has a contrast of ${ratio.toFixed(1)}:1. Text needs at least 4.5:1 to be readable.`)
  }
  return warnings
}

export interface SkinRegistry {
  list(): Skin[]
  get(name: string): Skin | undefined
}

/** Bundled skins first; an installed folder cannot replace a bundled skin of the same name. */
export function createSkinRegistry(bundled: SkinFiles[], installed: SkinFiles[]): SkinRegistry {
  const skins = new Map<string, Skin>()
  for (const files of bundled) skins.set(files.name, parseSkin(files, 'bundled'))
  for (const files of installed) {
    const skin = parseSkin(files, 'installed')
    if (!skins.has(skin.name)) skins.set(skin.name, skin)
  }
  return { list: () => [...skins.values()], get: name => skins.get(name) }
}
