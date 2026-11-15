// Small generated images for tests. Nothing here is a photograph.
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

export interface TestImage {
  width?: number
  height?: number
  format?: 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif' | 'gif'
  /** EXIF orientation 1 to 8; 6 means "rotate 90 degrees clockwise to view". */
  orientation?: number
  exif?: Record<string, string>
  /** Changes the pixels, so two images with different seeds differ. */
  seed?: number
}

export async function imageBuffer(options: TestImage = {}): Promise<Buffer> {
  const { width = 640, height = 480, format = 'jpeg', orientation, exif, seed = 1 } = options
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="hsl(${(seed * 47) % 360} 40% 40%)"/>`
    + `<rect x="0" y="0" width="${Math.ceil(width / 2)}" height="${Math.ceil(height / 3)}" fill="hsl(${(seed * 91) % 360} 60% 70%)"/>`
    + `</svg>`,
  )
  let image = sharp({ create: { width, height, channels: 3, background: '#808080' } })
    .composite([{ input: tile }])
  if (exif) image = image.withExif({ IFD0: exif })
  if (orientation) image = image.withMetadata({ orientation })
  return image.toFormat(format).toBuffer()
}

export async function imageFile(path: string, options: TestImage = {}): Promise<string> {
  writeFileSync(path, await imageBuffer(options))
  return path
}
