// The queued part of an upload (DESIGN.md section 7): read the camera
// details, then make the resized copies and the placeholder.
//
// Memory: the original is decoded once, straight down to a working raster
// of at most 2560 px on its long edge (about 20 MB). Every derivative is
// made from that raster, so a 40-megapixel original never sits in memory
// at full size.
import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import exifr from 'exifr'
import { rgbaToThumbHash } from 'thumbhash'
import { newId } from '../core/ids.ts'
import type { PipelineContext } from './context.ts'
import { exifColumns, exifForStorage } from './exif.ts'
import sharp from './image.ts'
import { planDerivatives, WORKING_EDGE, type PlannedDerivative } from './plan.ts'

const WEBP_QUALITY: Record<PlannedDerivative['kind'], number> = { thumb: 78, square: 78, medium: 82, large: 82 }
const THUMBHASH_EDGE = 100

interface PhotoRow { id: string, original_path: string, width: number, height: number }

async function readExif(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await exifr.parse(path) ?? undefined
  }
  catch {
    return undefined // a photo with damaged metadata is still a photo
  }
}

export interface ProcessOptions {
  /** False when re-rendering, so details the admin has edited are kept. */
  readMetadata?: boolean
}

export async function processPhoto(ctx: PipelineContext, photoId: string, options: ProcessOptions = {}): Promise<void> {
  const { sqlite, storage } = ctx
  const photo = sqlite.prepare(`select id, original_path, width, height from photos where id = ?`).get(photoId) as PhotoRow | undefined
  if (!photo) throw new Error(`There is no photo with id ${photoId}.`)
  const original = storage.localPath('originals', photo.original_path)
  if (await storage.size('originals', photo.original_path) === null) {
    throw new Error('The original file is missing from the data directory.')
  }

  const exif = options.readMetadata === false ? undefined : await readExif(original)

  const working = await sharp(original, { limitInputPixels: ctx.limits.maxPixels, sequentialRead: true })
    .rotate() // upright, from the EXIF orientation
    .resize({ width: WORKING_EDGE, height: WORKING_EDGE, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true })
  const raster = () => sharp(working.data, {
    raw: { width: working.info.width, height: working.info.height, channels: working.info.channels },
  })

  // Dimensions recorded at upload are the photo's real size; the plan is
  // made from those, and the working raster is large enough for all of it.
  const plan = planDerivatives(photo.width, photo.height)
  const scratch: string[] = []
  const written: { plan: PlannedDerivative, key: string, bytes: number }[] = []
  try {
    for (const item of plan) {
      const tmp = join(ctx.tmpDir, `${photo.id}-${item.kind}-${newId()}.webp`)
      scratch.push(tmp)
      const info = await raster()
        .resize(item.width, item.height, item.kind === 'square' ? { fit: 'cover', position: 'attention' } : { fit: 'fill' })
        .webp({ quality: WEBP_QUALITY[item.kind] })
        .toFile(tmp)
      // The name carries a hash of the contents, so the file can be cached
      // forever and a re-render with different pixels gets a new address.
      const hash = createHash('sha256').update(await readFile(tmp)).digest('hex').slice(0, 8)
      const key = `${photo.id}-${item.kind}-${hash}.webp`
      await storage.put('derivatives', key, tmp)
      written.push({ plan: item, key, bytes: info.size })
    }

    const small = await raster()
      .resize({ width: THUMBHASH_EDGE, height: THUMBHASH_EDGE, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const thumbhash = Buffer.from(rgbaToThumbHash(small.info.width, small.info.height, small.data)).toString('base64')

    const keep = new Set(written.map(file => file.key))
    const stale = (sqlite.prepare(`select path from derivatives where photo_id = ?`).all(photo.id) as { path: string }[])
      .map(row => row.path)
      .filter(path => !keep.has(path))

    sqlite.transaction(() => {
      // The photo may have been deleted while it was being processed.
      if (!sqlite.prepare(`select 1 from photos where id = ?`).get(photo.id)) throw new Error('The photo was deleted while it was being processed.')
      sqlite.prepare(`delete from derivatives where photo_id = ?`).run(photo.id)
      const insert = sqlite.prepare(`insert into derivatives (id, photo_id, kind, format, width, height, path, bytes) values (?, ?, ?, 'webp', ?, ?, ?, ?)`)
      for (const file of written) {
        insert.run(newId(), photo.id, file.plan.kind, file.plan.width, file.plan.height, file.key, file.bytes)
      }
      if (exif) {
        const columns = exifColumns(exif)
        const stored = exifForStorage(exif)
        sqlite.prepare(`
          update photos set camera = ?, lens = ?, focal_length = ?, aperture = ?, shutter = ?, iso = ?,
            taken_at = ?, lat = ?, lng = ?, exif_json = ? where id = ?
        `).run(columns.camera, columns.lens, columns.focalLength, columns.aperture, columns.shutter, columns.iso,
          columns.takenAt, columns.lat, columns.lng, stored ? JSON.stringify(stored) : null, photo.id)
      }
      sqlite.prepare(`update photos set thumbhash = ?, status = 'ready', updated_at = ? where id = ?`)
        .run(thumbhash, Date.now(), photo.id)
    })()

    for (const path of stale) await storage.delete('derivatives', path)
  }
  catch (error) {
    // Nothing was recorded, so remove whatever was already stored.
    const recorded = new Set((sqlite.prepare(`select path from derivatives where photo_id = ?`).all(photo.id) as { path: string }[]).map(row => row.path))
    for (const file of written) {
      if (!recorded.has(file.key)) await storage.delete('derivatives', file.key)
    }
    throw error
  }
  finally {
    for (const file of scratch) await rm(file, { force: true, maxRetries: 10, retryDelay: 50 })
  }
}
