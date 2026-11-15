import { describe, expect, it } from 'vitest'
import { exifColumns, exifForStorage } from '../../server/pipeline/exif.ts'

describe('exifColumns', () => {
  it('formats the fields shown on the site', () => {
    expect(exifColumns({
      Make: 'FUJIFILM', Model: 'X-T5', LensModel: 'XF35mmF1.4 R',
      FocalLength: 35, FNumber: 2.8, ExposureTime: 1 / 250, ISO: 400,
      DateTimeOriginal: new Date('2024-05-03T09:15:00Z'), latitude: 47.3769, longitude: 8.5417,
    })).toEqual({
      camera: 'FUJIFILM X-T5', lens: 'XF35mmF1.4 R', focalLength: '35 mm', aperture: 'f/2.8',
      shutter: '1/250 s', iso: 400, takenAt: Date.parse('2024-05-03T09:15:00Z'), lat: 47.3769, lng: 8.5417,
    })
  })
  it('does not repeat the maker when the model already names it', () => {
    expect(exifColumns({ Make: 'Canon', Model: 'Canon EOS R5' }).camera).toBe('Canon EOS R5')
    expect(exifColumns({ Make: 'NIKON CORPORATION', Model: 'NIKON Z 6' }).camera).toBe('NIKON Z 6')
  })
  it('writes long exposures in seconds and trims decimals', () => {
    expect(exifColumns({ ExposureTime: 2 }).shutter).toBe('2 s')
    expect(exifColumns({ ExposureTime: 0.5 }).shutter).toBe('1/2 s')
    expect(exifColumns({ ExposureTime: 1.3 }).shutter).toBe('1.3 s')
    expect(exifColumns({ FNumber: 8 }).aperture).toBe('f/8')
    expect(exifColumns({ FocalLength: 23.5 }).focalLength).toBe('23.5 mm')
  })
  it('returns nulls for a photo with no metadata', () => {
    expect(exifColumns(undefined)).toEqual({
      camera: null, lens: null, focalLength: null, aperture: null, shutter: null,
      iso: null, takenAt: null, lat: null, lng: null,
    })
  })
  it('ignores values of the wrong type or out of range', () => {
    const columns = exifColumns({ Make: 42, FNumber: 'wide', ISO: 'auto', DateTimeOriginal: 'yesterday', latitude: 123, longitude: 'x', ExposureTime: 0 })
    expect(columns).toMatchObject({ camera: null, aperture: null, iso: null, takenAt: null, lat: null, lng: null, shutter: null })
  })
  it('caps text so a hostile file cannot store a novel', () => {
    expect(exifColumns({ Model: 'x'.repeat(500) }).camera!.length).toBe(120)
  })
})

describe('exifForStorage', () => {
  it('keeps plain values, turns dates into ISO strings, and drops binary data', () => {
    const stored = exifForStorage({
      Make: 'Leica', ISO: 100, DateTimeOriginal: new Date('2024-01-02T03:04:05Z'),
      MakerNote: new Uint8Array(4000), thumbnail: Buffer.alloc(10), LensInfo: [35, 35, 1.4, 1.4],
    })
    expect(stored).toEqual({ Make: 'Leica', ISO: 100, DateTimeOriginal: '2024-01-02T03:04:05.000Z', LensInfo: [35, 35, 1.4, 1.4] })
  })
  it('returns null when there is nothing to keep', () => {
    expect(exifForStorage(undefined)).toBeNull()
    expect(exifForStorage({})).toBeNull()
  })
})
