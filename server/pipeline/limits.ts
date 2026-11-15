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
