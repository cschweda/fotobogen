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

export interface EmbeddedText {
  /** XMP, as Lightroom and most editors write it. */
  xmp?: { title?: string, description?: string, keywords?: string[], alt?: string }
  /** IPTC, the older form, still written by many programs. */
  iptc?: { title?: string, caption?: string, keywords?: string[] }
}

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A JPEG with words saved inside it, the way a photo editor saves a title, a caption and keywords. */
export function withEmbeddedText(jpeg: Buffer, { xmp, iptc }: EmbeddedText): Buffer {
  const segments: Buffer[] = []
  const segment = (marker: number, body: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt16BE(0xff00 | marker, 0)
    head.writeUInt16BE(body.length + 2, 2)
    return Buffer.concat([head, body])
  }
  if (xmp) {
    const alt = (tag: string, value?: string) => value === undefined ? '' : `<${tag}><rdf:Alt><rdf:li xml:lang="x-default">${xml(value)}</rdf:li></rdf:Alt></${tag}>`
    const packet = '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
      + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">'
      + alt('dc:title', xmp.title) + alt('dc:description', xmp.description) + alt('Iptc4xmpCore:AltTextAccessibility', xmp.alt)
      + (xmp.keywords ? `<dc:subject><rdf:Bag>${xmp.keywords.map(word => `<rdf:li>${xml(word)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>` : '')
      + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
    segments.push(segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(packet, 'utf8')])))
  }
  if (iptc) {
    const record = (dataset: number, value: Buffer) => {
      const head = Buffer.from([0x1c, 0x02, dataset, 0, 0])
      head.writeUInt16BE(value.length, 3)
      return Buffer.concat([head, value])
    }
    const records = Buffer.concat([
      Buffer.from([0x1c, 0x01, 0x5a, 0x00, 0x03, 0x1b, 0x25, 0x47]), // the text is UTF-8
      ...(iptc.title === undefined ? [] : [record(5, Buffer.from(iptc.title, 'utf8'))]),
      ...(iptc.keywords ?? []).map(word => record(25, Buffer.from(word, 'utf8'))),
      ...(iptc.caption === undefined ? [] : [record(120, Buffer.from(iptc.caption, 'utf8'))]),
    ])
    const size = Buffer.alloc(4)
    size.writeUInt32BE(records.length)
    const block = Buffer.concat([Buffer.from('8BIM', 'latin1'), Buffer.from([0x04, 0x04, 0x00, 0x00]), size, records, Buffer.alloc(records.length % 2)])
    segments.push(segment(0xed, Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), block])))
  }
  // Straight after the start-of-image marker, where such segments belong.
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)])
}
