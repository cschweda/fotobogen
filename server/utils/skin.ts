// The skin in use: which one, with which options, and the stylesheet that makes.
import { cleanValues, contrastWarnings, cssVersion, renderCss, type Skin, type SkinValues } from '../skins/registry.ts'
import { getSkins } from './app.ts'
import { getSetting } from './settings.ts'

export const DEFAULT_SKIN = 'swiss'

/** The active skin; falls back to the bundled one if the chosen skin is missing or broken. */
export function activeSkin(): { skin: Skin, values: SkinValues, css: string, version: string, warnings: string[] } {
  const skins = getSkins()
  const chosen = skins.get(getSetting('skin.active', DEFAULT_SKIN))
  const skin = chosen && !chosen.error ? chosen : skins.get(DEFAULT_SKIN)!
  const values = cleanValues(skin, getSetting<Record<string, unknown>>('skin.options', {})[skin.name])
  const css = renderCss(skin, values)
  return { skin, values, css, version: cssVersion(css), warnings: contrastWarnings(skin, values) }
}
