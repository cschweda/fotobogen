import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { webpHeaderSize } from '../../server/pipeline/accept.ts'

const webp = (width: number, height: number, options: sharp.WebpOptions) =>
  sharp({ create: { width, height, channels: 3, background: '#808080' } }).webp(options).toBuffer()

describe('the size a WebP file declares', () => {
  it('is read from the first bytes, for each kind of WebP', async () => {
    expect(webpHeaderSize((await webp(321, 123, { quality: 50 })).subarray(0, 32))).toEqual({ width: 321, height: 123 })
    expect(webpHeaderSize((await webp(321, 123, { lossless: true })).subarray(0, 32))).toEqual({ width: 321, height: 123 })
    // The extended kind, which a picture with transparency uses.
    const extended = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).webp({ quality: 50 }).toBuffer()
    expect(webpHeaderSize(extended.subarray(0, 32))).toEqual({ width: 300, height: 200 })
  })
  it('is null for anything else', () => {
    expect(webpHeaderSize(Buffer.from('not a webp file, just some text!!'))).toBeNull()
    expect(webpHeaderSize(Buffer.alloc(8))).toBeNull()
  })
})
