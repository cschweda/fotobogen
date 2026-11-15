// Skins (DESIGN.md section 11). A skin is a folder with skin.json and
// skin.css. It restyles the public pages; it does not change their markup,
// so switching skins needs no rebuild. Bundled skins ship in the build;
// the site owner's go in data/skins/<name>/.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Mode = 'light' | 'dark'
export const MODES: Mode[] = ['light', 'dark']
/** One colour for each mode. */
export type ModeColours = Record<Mode, string>

export type SkinOption
  = | { type: 'color', label?: string, default: ModeColours }
    | { type: 'select', label?: string, options: string[], default: string, values?: Record<string, string> }
    | { type: 'range', label?: string, min: number, max: number, step?: number, default: number }

export interface Skin {
  name: string
  version: string
  label: string
  description: string | null
  source: 'bundled' | 'installed'
  css: string
  /** The mode the skin's author means it to be seen in first. */
  mode: Mode
  /** The skin's named colours, once for light and once for dark. Each becomes --fb-<name>. */
  modes: Record<Mode, Record<string, string>>
  /** Pairs of token names that are text on a background. */
  contrast: [string, string][]
  options: Record<string, SkinOption>
  error: string | null
}

export type SkinValues = Record<string, string | number | ModeColours>
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
    // One colour for both modes, or one for each.
    const given = raw.default
    const fallback = typeof given === 'string' ? { light: given, dark: given } : isRecord(given) ? { light: given.light, dark: given.dark } : {}
    if (!MODES.every(mode => typeof fallback[mode] === 'string' && HEX.test(fallback[mode] as string))) {
      throw new Error(`Colour option "${key}" needs a default like "#e30613", or one for each mode: { "light": "#e30613", "dark": "#ff5a4f" }.`)
    }
    return { type: 'color', label, default: fallback as ModeColours }
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
  const blank: Skin = { name: NAME.test(files.name) ? files.name : 'invalid', version: '?', label: files.name, description: null, source, css: '', mode: 'light', modes: { light: {}, dark: {} }, contrast: [], options: {}, error: null }
  try {
    const json = JSON.parse(files.json) as unknown
    if (!isRecord(json)) throw new Error('skin.json must be a JSON object.')
    if (typeof json.name !== 'string' || !NAME.test(json.name)) throw new Error('skin.json needs a "name" of lowercase letters, digits, and hyphens.')
    if (json.name !== files.name) throw new Error(`The folder is called "${files.name}" but skin.json names the skin "${json.name}". They must match.`)
    if (typeof json.version !== 'string' || !json.version) throw new Error('skin.json needs a "version".')
    if (typeof json.label !== 'string' || !json.label) throw new Error('skin.json needs a "label".')
    if (!files.css.trim()) throw new Error('skin.css is missing or empty.')

    // Every skin can be seen in light and in dark, so it names its colours twice.
    const given = isRecord(json.modes) ? json.modes : {}
    if (!isRecord(given.light) || !isRecord(given.dark)) {
      throw new Error('skin.json needs "modes" with a "light" and a "dark" set of colours. Every skin can be viewed in both.')
    }
    const modes: Skin['modes'] = { light: {}, dark: {} }
    for (const mode of MODES) {
      for (const [key, value] of Object.entries(given[mode] as Record<string, unknown>)) {
        if (!NAME.test(key)) throw new Error('Colour names are lowercase letters, digits, and hyphens.')
        if (typeof value !== 'string' || !HEX.test(value)) throw new Error(`Colour "${key}" (${mode}) must be written like "#0a0a0b".`)
        modes[mode][key] = value.toLowerCase()
      }
    }
    if (Object.keys(modes.light).sort().join() !== Object.keys(modes.dark).sort().join()) {
      throw new Error('The light and dark modes must name the same colours.')
    }
    const contrast = (Array.isArray(json.contrast) ? json.contrast : [])
      .filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && pair.every(name => typeof name === 'string'))
    const options: Record<string, SkinOption> = {}
    for (const [key, raw] of Object.entries(isRecord(json.options) ? json.options : {})) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(key)) throw new Error('Option names are lowercase letters, digits, and hyphens.')
      options[key] = parseOption(key, raw)
    }
    return { ...blank, name: json.name, version: json.version, label: json.label, description: typeof json.description === 'string' ? json.description : null, css: files.css, mode: json.mode === 'dark' ? 'dark' : 'light', modes, contrast, options }
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
    if (option.type === 'color') {
      // A single colour is used for both modes.
      const pick = (mode: Mode) => {
        const colour = isRecord(value) ? value[mode] : value
        return typeof colour === 'string' && HEX.test(colour) ? colour.toLowerCase() : option.default[mode]
      }
      values[key] = { light: pick('light'), dark: pick('dark') }
    }
    else if (option.type === 'select') values[key] = typeof value === 'string' && option.options.includes(value) ? value : option.default
    else values[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(option.max, Math.max(option.min, value)) : option.default
  }
  return values
}

/** The colours of one mode: the skin's own, then any colour options chosen in the admin. */
export function modeColours(skin: Skin, values: SkinValues, mode: Mode): Record<string, string> {
  const colours = { ...skin.modes[mode] }
  for (const [key, option] of Object.entries(skin.options)) {
    if (option.type !== 'color') continue
    const value = values[key]
    colours[key] = typeof value === 'object' ? value[mode] : typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : option.default[mode]
  }
  return colours
}

/**
 * The stylesheet a browser gets: the skin's own, then its colours for each
 * mode, then its other options, all as custom properties.
 *
 * The <html> element carries data-fb-mode: "light", "dark", or "auto"
 * (follow the visitor's device).
 */
export function renderCss(skin: Skin, values: SkinValues): string {
  const colours = (mode: Mode) => [...Object.entries(modeColours(skin, values, mode)).map(([key, value]) => `--fb-${key}: ${value};`), `color-scheme: ${mode};`].join(' ')
  const overrides = Object.entries(skin.options).filter(([, option]) => option.type !== 'color').map(([key, option]) => {
    const value = values[key] ?? option.default
    const css = option.type === 'select' ? option.values?.[String(value)] ?? String(value) : String(value)
    return `  --fb-${key}: ${css};`
  })
  const toDark = '.fb-mode__to-dark { display: none; } .fb-mode__to-light { display: inline; }'
  return `${skin.css}

/* Colours for light and dark, from skin.json and the admin. */
:root.fb-public { ${colours('light')} }
:root.fb-public[data-fb-mode="dark"] { ${colours('dark')} }
@media (prefers-color-scheme: dark) { :root.fb-public[data-fb-mode="auto"] { ${colours('dark')} } }
/* The switch names the mode it changes to. */
.fb-mode__to-light { display: none; }
[data-fb-mode="dark"] ${toDark.replace(' .fb-mode__to-light', ' [data-fb-mode="dark"] .fb-mode__to-light')}
@media (prefers-color-scheme: dark) { [data-fb-mode="auto"] ${toDark.replace(' .fb-mode__to-light', ' [data-fb-mode="auto"] .fb-mode__to-light')} }
${overrides.length > 0 ? `\n/* Options chosen in the admin. */\n:root.fb-public {\n${overrides.join('\n')}\n}\n` : ''}`
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

/** Text-on-background pairs that fall below 4.5:1 in either mode, with the chosen option colours applied. */
export function contrastWarnings(skin: Skin, values: SkinValues): string[] {
  const warnings: string[] = []
  for (const mode of MODES) {
    const colours = modeColours(skin, values, mode)
    for (const [text, ground] of skin.contrast) {
      if (!colours[text] || !colours[ground]) continue
      const ratio = contrastRatio(colours[text], colours[ground])
      if (ratio < 4.5) warnings.push(`In ${mode} mode, "${text}" on "${ground}" has a contrast of ${ratio.toFixed(1)}:1. Text needs at least 4.5:1 to be readable.`)
    }
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
  // In name order, whatever order the build stored them in.
  for (const files of [...bundled].sort((a, b) => a.name.localeCompare(b.name))) skins.set(files.name, parseSkin(files, 'bundled'))
  for (const files of installed) {
    const skin = parseSkin(files, 'installed')
    if (!skins.has(skin.name)) skins.set(skin.name, skin)
  }
  return { list: () => [...skins.values()], get: name => skins.get(name) }
}
