import exifr from 'exifr'
import { describe, expect, it } from 'vitest'
import { embeddedWords, readEmbeddedWords, suggestAlt, WORDS_OPTIONS } from '../../server/pipeline/embedded.ts'
import { imageBuffer, withEmbeddedText } from '../helpers/images.ts'

const read = async (file: Buffer) => embeddedWords(await exifr.parse(file, WORDS_OPTIONS) as Record<string, unknown>)

describe('words saved inside a photo', () => {
  it('reads the title, caption, keywords and alt text an editor such as Lightroom saved (XMP)', async () => {
    const file = withEmbeddedText(await imageBuffer({ width: 64, height: 48 }), {
      xmp: { title: 'Harbour at dawn', description: 'Boats & gulls, <early>', keywords: ['sea', 'Boats'], alt: 'Three fishing boats tied up at a stone quay' },
    })
    expect(await read(file)).toEqual({
      title: 'Harbour at dawn', description: 'Boats & gulls, <early>', alt: 'Three fishing boats tied up at a stone quay', tags: ['sea', 'Boats'], takenAt: null,
    })
  })

  it('reads the older form (IPTC) when there is no XMP, accents and all, and prefers XMP when both are there', async () => {
    const base = await imageBuffer({ width: 64, height: 48 })
    expect(await read(withEmbeddedText(base, { iptc: { title: 'Café at night', caption: 'Zürich, in the rain', keywords: ['night', 'café'] } }))).toEqual({
      title: 'Café at night', description: 'Zürich, in the rain', alt: null, tags: ['night', 'café'], takenAt: null,
    })
    expect(await read(withEmbeddedText(base, { xmp: { title: 'From XMP' }, iptc: { title: 'From IPTC', keywords: ['kept'] } }))).toMatchObject({ title: 'From XMP', tags: ['kept'] })
    // One keyword is still a list of one.
    expect((await read(withEmbeddedText(base, { xmp: { keywords: ['solo'] } }))).tags).toEqual(['solo'])
  })

  it('takes a description a person wrote from the camera data, and ignores the ones cameras write by themselves', async () => {
    const described = (text: string) => imageBuffer({ width: 64, height: 48, exif: { ImageDescription: text } }).then(read)
    expect((await described('Market day in Lucca')).description).toBe('Market day in Lucca')
    for (const junk of ['OLYMPUS DIGITAL CAMERA', 'SONY DSC', 'DCIM100MEDIA', 'KONICA MINOLTA DIGITAL CAMERA', 'Exif_JPEG_PICTURE', 'digital camera', '   ']) {
      expect((await described(junk)).description, junk).toBeNull()
    }
  })

  it('cuts what it reads to the lengths the library allows, drops control characters, and survives nonsense', async () => {
    const long = withEmbeddedText(await imageBuffer({ width: 64, height: 48 }), {
      xmp: { title: 'T'.repeat(900), description: `line one\nline\u0000 two\u0007`, alt: 'A'.repeat(900), keywords: Array.from({ length: 80 }, (_, index) => `keyword ${index}`) },
    })
    const words = await read(long)
    expect(words.title).toHaveLength(200)
    expect(words.alt).toHaveLength(500)
    expect(words.description).toBe('line one\nline two')
    expect(words.tags).toHaveLength(30)
    for (const nonsense of [null, undefined, {}, { dc: 'x', iptc: 7 }, { dc: { title: { value: 5 }, subject: [1, {}, 'ok'] } }]) {
      expect(() => embeddedWords(nonsense as never)).not.toThrow()
    }
    expect(embeddedWords({ dc: { subject: [1, {}, 'ok'] } }).tags).toEqual(['ok'])
  })

  it('reads the day a photo was taken, as the camera wrote it', async () => {
    const file = await imageBuffer({ width: 64, height: 48 })
    const sharp = (await import('sharp')).default
    const dated = await sharp(file).withExif({ IFD2: { DateTimeOriginal: '2019:07:04 22:30:00' } }).jpeg().toBuffer()
    expect((await read(dated)).takenAt).toBe(Date.UTC(2019, 6, 4, 22, 30, 0))
  })

  it('answers with nothing for a file it cannot read', async () => {
    expect(await readEmbeddedWords('/no/such/file.jpg')).toEqual({ title: null, description: null, alt: null, tags: [], takenAt: null })
  })
})

describe('alt text written for a photo that has none', () => {
  it('uses the title when there is one', () => {
    expect(suggestAlt({ title: 'Harbour at dawn', filename: 'IMG_0042.jpg', takenAt: null })).toBe('Harbour at dawn')
  })
  it('makes words of a file name a person chose', () => {
    expect(suggestAlt({ title: null, filename: 'green-bicycle_by.the canal.JPG', takenAt: null })).toBe('Green bicycle by the canal')
    expect(suggestAlt({ title: null, filename: 'Évora rooftops 2.jpeg', takenAt: null })).toBe('Évora rooftops 2')
  })
  it('does not pass off a camera\'s file name as a description', () => {
    for (const name of ['IMG_0042.HEIC', 'DSC01234.jpg', 'DSCF0012.JPG', 'P1010001.jpg', 'PXL_20240601_081530123.jpg', '20240601_081530.jpg', 'photo.jpg', 'image (3).png', 'scan0004.tif', 'IMG-20240601-WA0007.jpg', 'x.jpg']) {
      expect(suggestAlt({ title: null, filename: name, takenAt: null }), name).toBe('Photograph')
      expect(suggestAlt({ title: null, filename: name, takenAt: Date.UTC(2024, 5, 1, 8, 15) }), name).toBe('Photograph taken on 1 June 2024')
    }
  })
})
