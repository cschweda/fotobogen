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
