// Upload limits (DESIGN.md section 6), settable through the environment.

export interface Limits {
  /** Largest accepted upload, in bytes. Mirror it in the proxy's body limit. */
  maxUploadBytes: number
  /** Largest accepted image, in pixels (width x height). */
  maxPixels: number
}

const DEFAULT_UPLOAD_MB = 50
const DEFAULT_MEGAPIXELS = 100

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function readLimits(env: Record<string, string | undefined>): Limits {
  return {
    maxUploadBytes: Math.round(positiveNumber(env.MAX_UPLOAD_MB, DEFAULT_UPLOAD_MB) * 1024 * 1024),
    maxPixels: Math.round(positiveNumber(env.MAX_MEGAPIXELS, DEFAULT_MEGAPIXELS) * 1_000_000),
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
const FORMAT_MEGAPIXELS: Record<string, number> = {
  'avif': 16,
  'webp': 60,
  'interlaced png': 40,
}

/** The pixel limit for one file: the configured limit, or the format's own if that is lower. */
export function pixelLimitFor(format: string, interlaced: boolean, limits: Limits): { maxPixels: number, kind: string | null } {
  const kind = format === 'png' ? (interlaced ? 'interlaced png' : null) : format
  const ceiling = kind && FORMAT_MEGAPIXELS[kind] ? FORMAT_MEGAPIXELS[kind] * 1_000_000 : Infinity
  return ceiling < limits.maxPixels ? { maxPixels: ceiling, kind } : { maxPixels: limits.maxPixels, kind: null }
}
