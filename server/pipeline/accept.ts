// The synchronous part of an upload (DESIGN.md section 7): check the file,
// refuse duplicates, store the original, record the photo, queue the work.
// The slow part (resizing) happens later, in the queue.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { newId } from '../core/ids.ts'
import { serial } from '../core/serial.ts'
import type { PipelineContext } from './context.ts'
import sharp from './image.ts'
import { pixelLimitFor } from './limits.ts'
import { slugify, uniqueSlug } from './slug.ts'

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif'

const FORMATS: Record<ImageFormat, { ext: string, mime: string }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  tiff: { ext: 'tif', mime: 'image/tiff' },
  avif: { ext: 'avif', mime: 'image/avif' },
}

export interface UploadInput {
  /** The uploaded bytes, in ctx.tmpDir. Always removed or moved by acceptUpload. */
  tmpPath: string
  /** The name the file had on the uploader's computer. Used for display and the slug only. */
  filename: string
  isSample?: boolean
  /** Hidden uploads are drafts: in the library, not on the site. Default: public. */
  visibility?: 'public' | 'hidden'
  title?: string
  description?: string
  alt?: string
}

export type AcceptResult
  = | { result: 'accepted', photo: { id: string, slug: string } }
    | { result: 'duplicate', existing: { id: string, slug: string, title: string | null, filename: string } }
    | { result: 'rejected', reason: 'not-an-image' | 'too-many-pixels', message: string }

const NOT_AN_IMAGE = 'This file is not a photo Fotobogen can read. Use a JPEG, PNG, WebP, TIFF, or AVIF file.'

/**
 * The format, judged from the file's first bytes. The file is only handed
 * to the image library when this recognises it, so formats outside the
 * accepted five (SVG, PDF, GIF, ...) never reach a decoder.
 */
export function sniffFormat(head: Uint8Array): ImageFormat | null {
  const bytes = Buffer.from(head.buffer, head.byteOffset, head.byteLength)
  const ascii = (start: number, end: number) => bytes.toString('latin1', start, end)
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) return 'png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return 'tiff'
  if (ascii(4, 8) === 'ftyp' && (ascii(8, 12) === 'avif' || ascii(8, 12) === 'avis')) return 'avif'
  return null
}

async function readHead(path: string): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const head = Buffer.alloc(32)
    const { bytesRead } = await file.read(head, 0, 32, 0)
    return head.subarray(0, bytesRead)
  }
  finally {
    await file.close()
  }
}

function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('error', reject)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * The size a WebP file says it is, read from its first bytes. Asking the
 * image library decodes the whole picture first, so a few kilobytes that
 * claim to be enormous are refused here, before any of that memory is used.
 * Null when the header is not one of the three WebP kinds.
 */
export function webpHeaderSize(head: Buffer): { width: number, height: number } | null {
  if (head.length < 30 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') return null
  const kind = head.toString('latin1', 12, 16)
  if (kind === 'VP8 ') return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff }
  if (kind === 'VP8L') {
    const bits = head.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (kind === 'VP8X') return { width: head.readUIntLE(24, 3) + 1, height: head.readUIntLE(27, 3) + 1 }
  return null
}

/** Reading a picture's size can take as much memory as the picture; one at a time. */
const oneAtATime = serial()

/** Pixel dimensions as the photo is viewed, after EXIF rotation; null when unreadable. */
async function readDimensions(path: string, format: ImageFormat): Promise<{ width: number, height: number, interlaced: boolean } | null> {
  try {
    const meta = await oneAtATime(() => sharp(path).metadata())
    const read = meta.format === 'heif' ? (meta.compression === 'av1' ? 'avif' : null) : meta.format
    if (read !== format || !meta.width || !meta.height) return null
    const turned = (meta.orientation ?? 1) >= 5 // orientations 5 to 8 swap the sides
    const interlaced = meta.isProgressive === true
    return turned ? { width: meta.height, height: meta.width, interlaced } : { width: meta.width, height: meta.height, interlaced }
  }
  catch {
    return null
  }
}

const megapixels = (pixels: number): string => {
  const count = Math.round(pixels / 100_000) / 10
  return `${count} megapixel${count === 1 ? '' : 's'}`
}

function isUniqueViolation(error: unknown, column: string): boolean {
  return (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
    && String((error as Error).message).includes(column)
}

export async function acceptUpload(ctx: PipelineContext, input: UploadInput): Promise<AcceptResult> {
  const { sqlite, storage } = ctx
  let stored: string | undefined
  try {
    const head = await readHead(input.tmpPath)
    const format = sniffFormat(head)
    if (!format) return { result: 'rejected', reason: 'not-an-image', message: NOT_AN_IMAGE }
    if (format === 'webp') {
      const declared = webpHeaderSize(head)
      const most = pixelLimitFor(format, false, ctx.limits).maxPixels
      if (declared && declared.width * declared.height > most) {
        return { result: 'rejected', reason: 'too-many-pixels', message: `This photo is ${megapixels(declared.width * declared.height)}; the limit for WebP files is ${megapixels(most)}, because they take much more memory to open. Save it as a JPEG and upload that.` }
      }
    }

    const checksum = await sha256(input.tmpPath)
    const findExisting = () => sqlite
      .prepare(`select id, slug, title, original_filename as filename from photos where checksum = ?`)
      .get(checksum) as { id: string, slug: string, title: string | null, filename: string } | undefined
    const existing = findExisting()
    if (existing) return { result: 'duplicate', existing }

    const size = await readDimensions(input.tmpPath, format)
    if (!size) return { result: 'rejected', reason: 'not-an-image', message: NOT_AN_IMAGE }
    const limit = pixelLimitFor(format, size.interlaced, ctx.limits)
    if (size.width * size.height > limit.maxPixels) {
      const NAMES: Record<string, string> = { 'avif': 'AVIF', 'webp': 'WebP', 'interlaced png': 'interlaced PNG' }
      return {
        result: 'rejected',
        reason: 'too-many-pixels',
        message: limit.kind
          ? `This photo is ${megapixels(size.width * size.height)}; the limit for ${NAMES[limit.kind]} files is ${megapixels(limit.maxPixels)}, because they take much more memory to open. Save it as a JPEG and upload that.`
          : `This photo is ${megapixels(size.width * size.height)}; the limit is ${megapixels(limit.maxPixels)}.`,
      }
    }

    const id = newId()
    const { ext, mime } = FORMATS[format]
    const key = `${id}.${ext}`
    const fileBytes = await fileSize(input.tmpPath)
    await storage.put('originals', key, input.tmpPath)
    stored = key

    const title = input.title?.trim() || null
    const filename = basename(input.filename).slice(0, 255) || 'photo'
    const wanted = slugify(title ?? basename(filename, extname(filename)))
    const now = Date.now()

    const insert = sqlite.transaction(() => {
      const slug = uniqueSlug(wanted, id, candidate =>
        sqlite.prepare(`select 1 from photos where slug = ?`).get(candidate) !== undefined)
      const { next } = sqlite.prepare(`select coalesce(max(sort_order), 0) + 1 as next from photos`).get() as { next: number }
      sqlite.prepare(`
        insert into photos (id, slug, title, description, alt, original_path, original_filename, mime, bytes,
          checksum, width, height, status, visibility, is_sample, sort_order, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?)
      `).run(id, slug, title, input.description?.trim() || null, input.alt?.trim() || null, key, filename, mime,
        fileBytes, checksum, size.width, size.height, input.visibility === 'hidden' ? 'hidden' : 'public', input.isSample ? 1 : 0, next, now, now)
      sqlite.prepare(`insert into jobs (id, type, photo_id, status, attempts, created_at) values (?, 'ingest', ?, 'queued', 0, ?)`)
        .run(newId(), id, now)
      return slug
    })

    try {
      const slug = insert()
      stored = undefined // the database now refers to the file
      return { result: 'accepted', photo: { id, slug } }
    }
    catch (error) {
      // The same file finished uploading in another request a moment ago.
      const winner = isUniqueViolation(error, 'checksum') ? findExisting() : undefined
      if (winner) return { result: 'duplicate', existing: winner }
      throw error
    }
  }
  finally {
    await rm(input.tmpPath, { force: true, maxRetries: 10, retryDelay: 50 })
    if (stored) await storage.delete('originals', stored)
  }
}

async function fileSize(path: string): Promise<number> {
  const file = await open(path, 'r')
  try {
    return (await file.stat()).size
  }
  finally {
    await file.close()
  }
}
