import { describe, expect, it } from 'vitest'
import { readLimits } from '../../server/pipeline/limits.ts'

describe('readLimits', () => {
  it('defaults to 50 MB and 100 megapixels', () => {
    expect(readLimits({})).toEqual({ maxUploadBytes: 50 * 1024 * 1024, maxPixels: 100_000_000 })
  })
  it('reads MAX_UPLOAD_MB and MAX_MEGAPIXELS', () => {
    expect(readLimits({ MAX_UPLOAD_MB: '120', MAX_MEGAPIXELS: '60' })).toEqual({ maxUploadBytes: 120 * 1024 * 1024, maxPixels: 60_000_000 })
  })
  it('falls back to the default for anything that is not a positive number', () => {
    expect(readLimits({ MAX_UPLOAD_MB: 'lots', MAX_MEGAPIXELS: '-5' })).toEqual(readLimits({}))
    expect(readLimits({ MAX_UPLOAD_MB: '0' })).toEqual(readLimits({}))
  })
})

describe('pixelLimitFor', () => {
  const limits = readLimits({})
  it('lowers the limit for formats that are held whole in memory', async () => {
    const { pixelLimitFor } = await import('../../server/pipeline/limits.ts')
    expect(pixelLimitFor('avif', false, limits)).toEqual({ maxPixels: 16_000_000, kind: 'avif' })
    expect(pixelLimitFor('webp', false, limits)).toEqual({ maxPixels: 60_000_000, kind: 'webp' })
    expect(pixelLimitFor('png', true, limits)).toEqual({ maxPixels: 40_000_000, kind: 'interlaced png' })
  })
  it('leaves JPEG, ordinary PNG, and TIFF at the configured limit', async () => {
    const { pixelLimitFor } = await import('../../server/pipeline/limits.ts')
    for (const format of ['jpeg', 'png', 'tiff']) {
      expect(pixelLimitFor(format, false, limits)).toEqual({ maxPixels: 100_000_000, kind: null })
    }
    expect(pixelLimitFor('jpeg', true, limits).maxPixels).toBe(100_000_000) // progressive JPEG shrinks on load
  })
  it('never raises a lower configured limit', async () => {
    const { pixelLimitFor } = await import('../../server/pipeline/limits.ts')
    expect(pixelLimitFor('avif', false, readLimits({ MAX_MEGAPIXELS: '8' }))).toEqual({ maxPixels: 8_000_000, kind: null })
  })
})
