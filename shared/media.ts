// How hard the copies of photos made for the web are compressed.
//
// "Standard" is the set of values in fotobogen.config.js. The owner can
// choose another in the admin, under Settings. Each value is a WebP quality
// from 1 to 100 for one size of copy: higher is closer to the original, and
// a larger file.
import config from '../fotobogen.config.js'

type Quality = Record<'thumb' | 'square' | 'medium' | 'large', number>

export const QUALITY_PRESETS = {
  smaller: { label: 'Smaller files', about: 'Pages load fastest and use the least disk. Fine detail and smooth skies show a little compression when looked at closely.', quality: { thumb: 68, square: 68, medium: 72, large: 72 } as Quality },
  standard: { label: 'Standard', about: 'A balance that suits most photographs. Differences from the original are hard to see.', quality: config.internals.derivatives.webpQuality as Quality },
  high: { label: 'High', about: 'Closest to the original. Files are roughly half as large again, so pages are a little slower and the disk fills sooner.', quality: { thumb: 86, square: 86, medium: 90, large: 90 } as Quality },
} as const

export type QualityPreset = keyof typeof QUALITY_PRESETS
export const QUALITY_PRESET_NAMES = Object.keys(QUALITY_PRESETS) as QualityPreset[]
export const DEFAULT_QUALITY: QualityPreset = 'standard'
export const isQualityPreset = (value: unknown): value is QualityPreset => typeof value === 'string' && value in QUALITY_PRESETS
