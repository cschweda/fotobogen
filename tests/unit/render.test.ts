import { copyFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { deletePhotos } from '../../server/pipeline/remove.ts'
import { processPhoto } from '../../server/pipeline/render.ts'
import { imageFile, type TestImage } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

async function accepted(ctx: ReturnType<typeof testContext>, image: TestImage, filename = 'photo.jpg') {
  const tmpPath = await imageFile(join(ctx.tmpDir, `up-${image.seed ?? 1}`), image)
  const outcome = await acceptUpload(ctx, { tmpPath, filename })
  if (outcome.result !== 'accepted') throw new Error(`not accepted: ${JSON.stringify(outcome)}`)
  return outcome.photo.id
}

interface Derivative { kind: string, format: string, width: number, height: number, path: string, bytes: number }
const derivatives = (ctx: ReturnType<typeof testContext>) =>
  rows<Derivative>(ctx, 'select kind, format, width, height, path, bytes from derivatives order by width * height')

describe('processPhoto', () => {
  it('makes the web copies of an iPhone HEIC, reads its camera details from the file as uploaded, and removes both files with the photo', async () => {
    const ctx = testContext()
    const tmpPath = join(ctx.tmpDir, 'up-heic')
    copyFileSync('tests/fixtures/iphone.heic', tmpPath)
    const outcome = await acceptUpload(ctx, { tmpPath, filename: 'IMG_0042.HEIC' })
    if (outcome.result !== 'accepted') throw new Error('not accepted')
    const id = outcome.photo.id
    await processPhoto(ctx, id)

    expect(derivatives(ctx).map(d => [d.kind, d.format, d.width, d.height])).toEqual([['square', 'webp', 200, 200], ['thumb', 'webp', 320, 200], ['medium', 'webp', 320, 200]])
    const [photo] = rows<Record<string, unknown>>(ctx, 'select status, camera, lens, taken_at from photos')
    expect(photo).toEqual({ status: 'ready', camera: 'Apple iPhone 15', lens: 'iPhone 15 back camera 6.86mm f/1.6', taken_at: Date.UTC(2024, 5, 1, 8, 15, 30) })

    // If the JPEG made from it is ever lost (an old backup, a tidy-up by hand), it is made again from the upload.
    unlinkSync(join(ctx.root, 'originals', `${id}.heic.jpg`))
    await processPhoto(ctx, id)
    expect(readdirSync(join(ctx.root, 'originals')).sort()).toEqual([`${id}.heic`, `${id}.heic.jpg`])

    expect(await deletePhotos(ctx, { ids: [id] })).toEqual({ count: 1, leftBehind: [] })
    expect(readdirSync(join(ctx.root, 'originals'))).toEqual([])
  })

  it('writes WebP derivatives at the planned sizes and marks the photo ready', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, { width: 3000, height: 2000 })
    await processPhoto(ctx, id)

    const made = derivatives(ctx)
    expect(made.map(d => [d.kind, d.width, d.height])).toEqual([
      ['thumb', 480, 320], ['square', 480, 480], ['medium', 1280, 853], ['large', 2560, 1707],
    ])
    for (const d of made) {
      expect(d.format).toBe('webp')
      expect(d.path).toMatch(new RegExp(`^${id}-${d.kind}-[0-9a-f]{8}\\.webp$`))
      const file = join(ctx.root, 'derivatives', d.path)
      const meta = await sharp(file).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', d.width, d.height])
      expect(d.bytes).toBeGreaterThan(0)
    }
    const [photo] = rows<{ status: string, thumbhash: string }>(ctx, 'select status, thumbhash from photos')
    expect(photo!.status).toBe('ready')
    expect(Buffer.from(photo!.thumbhash, 'base64').length).toBeGreaterThan(4)
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })

  it('turns a sideways photo upright', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, { width: 800, height: 600, orientation: 6 })
    await processPhoto(ctx, id)
    const medium = derivatives(ctx).find(d => d.kind === 'medium')!
    expect([medium.width, medium.height]).toEqual([600, 800])
    const meta = await sharp(join(ctx.root, 'derivatives', medium.path)).metadata()
    expect([meta.width, meta.height, meta.orientation]).toEqual([600, 800, undefined])
  })

  it('never upscales a small photo', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, { width: 300, height: 200 })
    await processPhoto(ctx, id)
    expect(derivatives(ctx).map(d => [d.kind, d.width, d.height])).toEqual([
      ['square', 200, 200], ['thumb', 300, 200], ['medium', 300, 200],
    ])
  })

  it('reads camera details into the photo, and strips them from the derivatives', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, { exif: { Make: 'FUJIFILM', Model: 'X-T5' } })
    await processPhoto(ctx, id)
    const [photo] = rows<{ camera: string, exif_json: string }>(ctx, 'select camera, exif_json from photos')
    expect(photo!.camera).toBe('FUJIFILM X-T5')
    expect(JSON.parse(photo!.exif_json)).toMatchObject({ Make: 'FUJIFILM', Model: 'X-T5' })
    for (const d of derivatives(ctx)) {
      const meta = await sharp(join(ctx.root, 'derivatives', d.path)).metadata()
      expect(meta.exif).toBeUndefined()
    }
  })

  it('handles PNG with transparency, WebP, TIFF, and AVIF originals', async () => {
    const ctx = testContext()
    for (const [seed, format] of (['png', 'webp', 'tiff', 'avif'] as const).entries()) {
      const id = await accepted(ctx, { format, seed: seed + 10, width: 500, height: 400 }, `photo.${format}`)
      await processPhoto(ctx, id)
    }
    expect(rows(ctx, `select count(*) as ready from photos where status = 'ready'`)).toEqual([{ ready: 4 }])
  })

  it('replaces the old files when a photo is processed again', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, { width: 1000, height: 800 })
    await processPhoto(ctx, id)
    const before = readdirSync(join(ctx.root, 'derivatives')).sort()
    await processPhoto(ctx, id)
    expect(readdirSync(join(ctx.root, 'derivatives')).sort()).toEqual(before)
    expect(derivatives(ctx)).toHaveLength(3)
  })

  it('fails with a clear error when the original is missing, and writes nothing', async () => {
    const ctx = testContext()
    const id = await accepted(ctx, {})
    unlinkSync(join(ctx.root, 'originals', `${id}.jpg`))
    await expect(processPhoto(ctx, id)).rejects.toThrow()
    expect(derivatives(ctx)).toEqual([])
    expect(existsSync(join(ctx.root, 'derivatives')) ? readdirSync(join(ctx.root, 'derivatives')) : []).toEqual([])
    expect(readdirSync(ctx.tmpDir)).toEqual([])
  })
})
