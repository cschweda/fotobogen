// Upload limits (DESIGN.md section 6), settable through the environment.
import { config, resolveSettings } from '../core/config.ts'

export interface Limits {
  /** Largest accepted upload, in bytes. Mirror it in the proxy's body limit. */
  maxUploadBytes: number
  /** Largest accepted image, in pixels (width x height). */
  maxPixels: number
}

/** The limits in force: MAX_UPLOAD_MB and MAX_MEGAPIXELS, else fotobogen.config.js. */
export function readLimits(env: Record<string, string | undefined>): Limits {
  const settings = resolveSettings(env)
  return {
    maxUploadBytes: Math.round(settings.maxUploadMb * 1024 * 1024),
    maxPixels: Math.round(settings.maxMegapixels * 1_000_000),
  }
}

/**
 * Some formats cannot be decoded straight down to a small size: the whole
 * image is held in memory first. Measured peak memory for this pipeline
 * (sharp 0.35, one image at a time): AVIF about 27 MB per megapixel, WebP
 * and interlaced PNG 5 to 9 MB per megapixel, against about 1 to 4 MB for
 * JPEG, ordinary PNG, and TIFF. These ceilings keep any one photo under
 * roughly 450 MB so a 1 GB server survives it.
 */
const FORMAT_MEGAPIXELS: Record<string, number> = config.internals.formatMegapixels

/** The pixel limit for one file: the configured limit, or the format's own if that is lower. */
export function pixelLimitFor(format: string, interlaced: boolean, limits: Limits): { maxPixels: number, kind: string | null } {
  const kind = format === 'png' ? (interlaced ? 'interlaced png' : null) : format
  const ceiling = kind && FORMAT_MEGAPIXELS[kind] ? FORMAT_MEGAPIXELS[kind] * 1_000_000 : Infinity
  return ceiling < limits.maxPixels ? { maxPixels: ceiling, kind } : { maxPixels: limits.maxPixels, kind: null }
}
