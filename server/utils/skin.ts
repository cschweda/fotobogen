// The skin in use: which one, with which options, and the stylesheet that makes.
import { cleanValues, contrastWarnings, cssVersion, renderCss, type Mode, type Skin, type SkinValues } from '../skins/registry.ts'
import { getSkins } from './app.ts'
import { getSetting } from './settings.ts'

export const DEFAULT_SKIN = 'swiss'

/** What the owner can choose: the skin's own mode, one mode for everyone, or each visitor's device setting. */
export const MODE_CHOICES = ['skin', 'light', 'dark', 'auto'] as const
export type ModeChoice = typeof MODE_CHOICES[number]

/** The active skin; falls back to the bundled one if the chosen skin is missing or broken. */
export function activeSkin(): { skin: Skin, values: SkinValues, css: string, version: string, warnings: string[], mode: Mode | 'auto' } {
  const skins = getSkins()
  const chosen = skins.get(getSetting('skin.active', DEFAULT_SKIN))
  const skin = chosen && !chosen.error ? chosen : skins.get(DEFAULT_SKIN)!
  const values = cleanValues(skin, getSetting<Record<string, unknown>>('skin.options', {})[skin.name])
  const css = renderCss(skin, values)
  // The mode a visitor sees first. They can switch; this is only the default.
  const choice = getSetting<ModeChoice>('skin.mode', 'skin')
  const mode = choice === 'light' || choice === 'dark' || choice === 'auto' ? choice : skin.mode
  return { skin, values, css, version: cssVersion(css), warnings: contrastWarnings(skin, values), mode }
}
