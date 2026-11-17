import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { acceptUpload, sniffFormat } from '../../server/pipeline/accept.ts'
import { imageBuffer, imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

describe('sniffFormat', () => {
  it('recognises the five accepted formats from their first bytes', async () => {
    for (const format of ['jpeg', 'png', 'webp', 'tiff', 'avif'] as const) {
      expect(sniffFormat(await imageBuffer({ format, width: 32, height: 32 }))).toBe(format)
    }
  })
  it('recognises nothing else', async () => {
    expect(sniffFormat(await imageBuffer({ format: 'gif', width: 32, height: 32 }))).toBeNull()
    expect(sniffFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffFormat(Buffer.from('%PDF-1.7'))).toBeNull()
    expect(sniffFormat(Buffer.alloc(0))).toBeNull()
  })
})

describe('acceptUpload', () => {
  it('stores the original, records the photo as processing, and queues an ingest job', async () => {
    const ctx = testContext()
    const tmpPath = await imageFile(join(ctx.tmpDir, 'up1'), { width: 800, height: 600 })
    const outcome = await acceptUpload(ctx, { tmpPath, filename: 'Morning at the Lake.JPG' })
    expect(outcome.result).toBe('accepted')
    if (outcome.result !== 'accepted') return
    expect(outcome.photo.slug).toBe('morning-at-the-lake')

    const [photo] = rows<Record<string, unknown>>(ctx, 'select * from photos')
    expect(photo).toMatchObject({
      id: outcome.photo.id, slug: 'morning-at-the-lake', title: null, original_filename: 'Morning at the Lake.JPG',
      original_path: `${outcome.photo.id}.jpg`, mime: 'image/jpeg', width: 800, height: 600,
      status: 'processing', visibility: 'public', is_sample: 0,
    })
    expect(String(photo!.checksum)).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(ctx.root, 'originals', `${outcome.photo.id}.jpg`))).toBe(true)
    expect(existsSync(tmpPath)).toBe(false)
    expect(rows(ctx, 'select type, photo_id, status, attempts from jobs')).toEqual([
      { type: 'ingest', photo_id: outcome.photo.id, status: 'queued', attempts: 0 },
    ])
  })

  it('records the dimensions as the photo is viewed, after EXIF rotation', async () => {
    const ctx = testContext()
    const tmpPath = await imageFile(join(ctx.tmpDir, 'up'), { width: 800, height: 600, orientation: 6 })
    await acceptUpload(ctx, { tmpPath, filename: 'sideways.jpg' })
    expect(rows(ctx, 'select width, height from photos')).toEqual([{ width: 600, height: 800 }])
  })

  it('refuses the same file twice and names the photo that already has it', async () => {
    const ctx = testContext()
    const bytes = await imageBuffer({ seed: 7 })
    writeFileSync(join(ctx.tmpDir, 'a'), bytes)
    writeFileSync(join(ctx.tmpDir, 'b'), bytes)
    const first = await acceptUpload(ctx, { tmpPath: join(ctx.tmpDir, 'a'), filename: 'one.jpg', title: 'The First' })
    const second = await acceptUpload(ctx, { tmpPath: join(ctx.tmpDir, 'b'), filename: 'copy.jpg' })
    expect(second).toEqual({
      result: 'duplicate',
      existing: { id: (first as { photo: { id: string } }).photo.id, slug: 'the-first', title: 'The First', filename: 'one.jpg', trashed: 0 }, // in the library, not in the trash
    })
    expect(rows(ctx, 'select id from photos')).toHaveLength(1)
    expect(readdirSync(join(ctx.root, 'originals'))).toHaveLength(1)
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('keeps one copy when the same file arrives twice at the same moment', async () => {
    const ctx = testContext()
    const bytes = await imageBuffer({ seed: 9 })
    writeFileSync(join(ctx.tmpDir, 'a'), bytes)
    writeFileSync(join(ctx.tmpDir, 'b'), bytes)
    const results = await Promise.all([
      acceptUpload(ctx, { tmpPath: join(ctx.tmpDir, 'a'), filename: 'x.jpg' }),
      acceptUpload(ctx, { tmpPath: join(ctx.tmpDir, 'b'), filename: 'x.jpg' }),
    ])
    expect(results.map(r => r.result).sort()).toEqual(['accepted', 'duplicate'])
    expect(rows(ctx, 'select id from photos')).toHaveLength(1)
    expect(rows(ctx, 'select id from jobs')).toHaveLength(1)
    expect(readdirSync(join(ctx.root, 'originals'))).toHaveLength(1)
  })

  it('gives a second photo with the same name its own slug', async () => {
    const ctx = testContext()
    for (const seed of [1, 2, 3]) {
      const tmpPath = await imageFile(join(ctx.tmpDir, `up${seed}`), { seed })
      await acceptUpload(ctx, { tmpPath, filename: 'IMG_0042.jpg' })
    }
    expect(rows<{ slug: string }>(ctx, 'select slug from photos order by sort_order').map(r => r.slug))
      .toEqual(['img-0042', 'img-0042-2', 'img-0042-3'])
    expect(rows<{ sort_order: number }>(ctx, 'select sort_order from photos order by sort_order').map(r => r.sort_order)).toEqual([1, 2, 3])
  })

  it('rejects a file that is not an image, and leaves nothing behind', async () => {
    const ctx = testContext()
    const tmpPath = join(ctx.tmpDir, 'notes')
    writeFileSync(tmpPath, 'just some text, not a picture')
    const outcome = await acceptUpload(ctx, { tmpPath, filename: 'notes.jpg' })
    expect(outcome).toMatchObject({ result: 'rejected', reason: 'not-an-image' })
    expect(rows(ctx, 'select id from photos')).toEqual([])
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('rejects a format outside the accepted five, whatever it is named', async () => {
    const ctx = testContext()
    const tmpPath = await imageFile(join(ctx.tmpDir, 'up'), { format: 'gif' })
    expect(await acceptUpload(ctx, { tmpPath, filename: 'animation.jpg' })).toMatchObject({ result: 'rejected', reason: 'not-an-image' })
  })

  it('rejects a file that starts like a JPEG but cannot be read', async () => {
    const ctx = testContext()
    const tmpPath = join(ctx.tmpDir, 'broken')
    writeFileSync(tmpPath, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('garbage'.repeat(50))]))
    expect(await acceptUpload(ctx, { tmpPath, filename: 'broken.jpg' })).toMatchObject({ result: 'rejected', reason: 'not-an-image' })
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('rejects an image with more pixels than the limit', async () => {
    const ctx = testContext({ MAX_MEGAPIXELS: '1' })
    const tmpPath = await imageFile(join(ctx.tmpDir, 'big'), { width: 1200, height: 900 })
    const outcome = await acceptUpload(ctx, { tmpPath, filename: 'big.jpg' })
    expect(outcome).toMatchObject({ result: 'rejected', reason: 'too-many-pixels' })
    expect((outcome as { message: string }).message).toContain('1 megapixel')
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('stores sample details when given them', async () => {
    const ctx = testContext()
    const tmpPath = await imageFile(join(ctx.tmpDir, 'up'), { format: 'png' })
    await acceptUpload(ctx, { tmpPath, filename: 'sample.png', isSample: true, title: 'Harbour', description: 'Photo by A on Unsplash', alt: 'Boats in a harbour' })
    expect(rows(ctx, 'select title, description, alt, is_sample, mime, slug from photos')).toEqual([
      { title: 'Harbour', description: 'Photo by A on Unsplash', alt: 'Boats in a harbour', is_sample: 1, mime: 'image/png', slug: 'harbour' },
    ])
  })
})

describe('formats that are costly to open', () => {
  it('holds AVIF to 16 megapixels and says what to do instead', async () => {
    const ctx = testContext()
    // A flat colour at the lowest effort: encoding 16 megapixels of AVIF is slow otherwise.
    const tmpPath = join(ctx.tmpDir, 'big-avif')
    await sharp({ create: { width: 4100, height: 4000, channels: 3, background: '#445566' } }).avif({ effort: 0 }).toFile(tmpPath)
    const outcome = await acceptUpload(ctx, { tmpPath, filename: 'big.avif' })
    expect(outcome).toMatchObject({ result: 'rejected', reason: 'too-many-pixels' })
    expect((outcome as { message: string }).message).toBe(
      'This photo is 16.4 megapixels; the limit for AVIF files is 16 megapixels, because they take much more memory to open. Save it as a JPEG and upload that.',
    )
  }, 60_000)
  it('accepts an AVIF within its limit, and a JPEG of the same size as the refused AVIF', async () => {
    const ctx = testContext()
    const small = await imageFile(join(ctx.tmpDir, 'ok-avif'), { format: 'avif', width: 1200, height: 800 })
    expect((await acceptUpload(ctx, { tmpPath: small, filename: 'ok.avif' })).result).toBe('accepted')
    const jpeg = await imageFile(join(ctx.tmpDir, 'big-jpeg'), { format: 'jpeg', width: 4100, height: 4000 })
    expect((await acceptUpload(ctx, { tmpPath: jpeg, filename: 'big.jpg' })).result).toBe('accepted')
  })
})
