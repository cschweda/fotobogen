// The queued part of an upload (DESIGN.md section 7): read the camera
// details, then make the resized copies and the placeholder.
//
// Memory: the original is decoded once into a working raster of at most
// 2560 px on its long edge (about 20 MB), and every derivative is made from
// that. JPEG, ordinary PNG, and TIFF are shrunk as they are read, so a
// 100-megapixel original peaks at a few hundred MB. AVIF, WebP, and
// interlaced PNG are held whole while decoding, which is why acceptUpload
// gives them lower pixel limits (see limits.ts).
import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import exifr from 'exifr'
import { rgbaToThumbHash } from 'thumbhash'
import { config } from '../core/config.ts'
import { newId } from '../core/ids.ts'
import type { RecipeStep } from '../modules/contract.ts'
import type { Raster } from '../modules/registry.ts'
import type { PipelineContext } from './context.ts'
import { exifColumns, exifForStorage } from './exif.ts'
import sharp from './image.ts'
import { planDerivatives, WORKING_EDGE, type PlannedDerivative } from './plan.ts'

const WEBP_QUALITY: Record<PlannedDerivative['kind'], number> = config.internals.derivatives.webpQuality
const THUMBHASH_EDGE = 100

interface PhotoRow { id: string, original_path: string, width: number, height: number, recipe_json: string | null }

async function readExif(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await exifr.parse(path) ?? undefined
  }
  catch {
    return undefined // a photo with damaged metadata is still a photo
  }
}

/** Decode a stored original, upright and in sRGB, no larger than `edge` on its long side. */
async function workingRaster(ctx: PipelineContext, path: string, edge: number): Promise<Raster> {
  const { data, info } = await sharp(path, { limitInputPixels: ctx.limits.maxPixels, sequentialRead: true })
    .rotate() // upright, from the EXIF orientation
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

export const SITE_RECIPE_KEY = 'modules.site_recipe'

/** The recipe applied to every photo that does not have its own. */
export function siteRecipe(ctx: PipelineContext): RecipeStep[] {
  const row = ctx.sqlite.prepare(`select value from settings where key = ?`).get(SITE_RECIPE_KEY) as { value: string } | undefined
  return ctx.modules?.cleanRecipe(row ? JSON.parse(row.value) : []) ?? []
}

/**
 * A photo's own recipe wins, even an empty one ("none for this photo").
 * A photo with no recipe of its own (null) follows the site-wide one.
 */
export function effectiveRecipe(ctx: PipelineContext, own: string | null): RecipeStep[] {
  return own === null ? siteRecipe(ctx) : ctx.modules?.cleanRecipe(JSON.parse(own)) ?? []
}

function queueRerender(ctx: PipelineContext, where: string, ...values: unknown[]): number {
  const { sqlite } = ctx
  const ids = (sqlite.prepare(`select id from photos where status in ('ready', 'failed') and ${where}`).all(...values) as { id: string }[]).map(row => row.id)
  const now = Date.now()
  for (const id of ids) {
    sqlite.prepare(`update photos set status = 'processing', updated_at = ? where id = ?`).run(now, id)
    sqlite.prepare(`insert into jobs (id, type, photo_id, status, attempts, created_at) values (?, 'rerender', ?, 'queued', 0, ?)`).run(newId(), id, now)
  }
  return ids.length
}

/** Store the site-wide recipe and queue every photo that follows it. Returns how many were queued. */
export function setSiteRecipe(ctx: PipelineContext, recipe: unknown): { recipe: RecipeStep[], queued: number } {
  const clean = ctx.modules?.cleanRecipe(recipe) ?? []
  const queued = ctx.sqlite.transaction(() => {
    ctx.sqlite.prepare(`insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value`)
      .run(SITE_RECIPE_KEY, JSON.stringify(clean))
    return queueRerender(ctx, 'recipe_json is null')
  })()
  return { recipe: clean, queued }
}

/** Queue every photo that uses a module, after it is switched on or off. */
export function rerenderForModule(ctx: PipelineContext, name: string): number {
  // cleanRecipe keeps the steps of a module that is switched off, so this sees it either way.
  const usedBySite = siteRecipe(ctx).some(step => step.module === name)
  return ctx.sqlite.transaction(() => queueRerender(ctx,
    usedBySite ? `(recipe_json is null or recipe_json like ?)` : `recipe_json like ?`, `%"module":"${name}"%`))()
}

const PREVIEW_EDGE = config.internals.derivatives.previewEdge

/**
 * What a photo would look like with a recipe, as a WebP, without saving
 * anything. Made at a small size so the edit screen can show it at once.
 */
export async function renderPreview(ctx: PipelineContext, photoId: string, recipe: unknown): Promise<Buffer | null> {
  const photo = ctx.sqlite.prepare(`select original_path from photos where id = ?`).get(photoId) as { original_path: string } | undefined
  if (!photo || !ctx.modules) return null
  const decoded = await workingRaster(ctx, ctx.storage.localPath('originals', photo.original_path), PREVIEW_EDGE)
  const result = await ctx.modules.apply(decoded, ctx.modules.cleanRecipe(recipe))
  return sharp(result.data, { raw: { width: result.width, height: result.height, channels: result.channels } }).webp({ quality: 80 }).toBuffer()
}

/**
 * Store a photo's own recipe and queue it to be rendered again. `null`
 * means "follow the site-wide recipe"; an empty list means "none for this
 * photo". Returns false when there is no such photo or it is busy.
 */
export function setRecipe(ctx: PipelineContext, photoId: string, recipe: unknown): { recipe: RecipeStep[] | null } | false {
  if (!ctx.modules) return false
  const clean = recipe === null ? null : ctx.modules.cleanRecipe(recipe)
  const saved = ctx.sqlite.transaction(() => {
    const changed = ctx.sqlite.prepare(`update photos set recipe_json = ? where id = ? and status in ('ready', 'failed')`)
      .run(clean === null ? null : JSON.stringify(clean), photoId).changes
    return changed > 0 && queueRerender(ctx, 'id = ?', photoId) > 0
  })()
  return saved ? { recipe: clean } : false
}

export interface ProcessOptions {
  /** False when re-rendering, so details the admin has edited are kept. */
  readMetadata?: boolean
}

export async function processPhoto(ctx: PipelineContext, photoId: string, options: ProcessOptions = {}): Promise<void> {
  const { sqlite, storage } = ctx
  const photo = sqlite.prepare(`select id, original_path, width, height, recipe_json from photos where id = ?`).get(photoId) as PhotoRow | undefined
  if (!photo) throw new Error(`There is no photo with id ${photoId}.`)
  const original = storage.localPath('originals', photo.original_path)
  if (await storage.size('originals', photo.original_path) === null) {
    throw new Error('The original file is missing from the data directory.')
  }

  const exif = options.readMetadata === false ? undefined : await readExif(original)

  const recipe = effectiveRecipe(ctx, photo.recipe_json)
  const decoded = await workingRaster(ctx, original, WORKING_EDGE)
  // The recipe is applied to the working copy; the original file is never changed.
  const working = recipe.length > 0 && ctx.modules ? await ctx.modules.apply(decoded, recipe) : decoded
  const raster = () => sharp(working.data, { raw: { width: working.width, height: working.height, channels: working.channels } })

  // Without a recipe, the plan comes from the photo's real size, recorded at
  // upload. A transform may change the size (a border does), so with a
  // recipe the plan comes from the transformed picture, scaled back up by
  // however much the original was shrunk to make the working copy.
  const shrink = Math.max(photo.width, photo.height) / Math.max(decoded.width, decoded.height)
  const plan = working === decoded
    ? planDerivatives(photo.width, photo.height)
    : planDerivatives(Math.round(working.width * shrink), Math.round(working.height * shrink))
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
