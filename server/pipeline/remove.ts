// Deleting photos.
//
// A photo the owner deletes goes to the trash first: off the site at once,
// but kept, file and all, for thirty days, and put back with one press. Only
// from the trash is a photo deleted for good: the rows, then the files they
// pointed at.
import { readableKey } from './heic.ts'
import { newId } from '../core/ids.ts'
import type { PipelineContext } from './context.ts'

export interface DeleteResult {
  count: number
  /** Files that could not be deleted; their rows are gone. */
  leftBehind: string[]
}

/** How long a photo stays in the trash before it is removed for good. */
export const TRASH_DAYS = 30
export const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

/** Moves photos to the trash. Returns how many were moved (those already there are not counted). */
export function trashPhotos(ctx: PipelineContext, ids: string[], now = Date.now()): number {
  const move = ctx.sqlite.prepare(`update photos set status = 'trashed', trashed_at = ?, updated_at = ? where id = ? and status <> 'trashed'`)
  return ctx.sqlite.transaction(() => ids.reduce((count, id) => count + move.run(now, now, id).changes, 0))()
}

/**
 * Takes photos back out of the trash. Each is made again from the file that
 * was uploaded, so it comes back in the site's present look whatever changed
 * while it was away. Returns how many were restored.
 */
export function restorePhotos(ctx: PipelineContext, ids: string[], now = Date.now()): number {
  const { sqlite } = ctx
  const back = sqlite.prepare(`update photos set status = 'processing', trashed_at = null, updated_at = ? where id = ? and status = 'trashed'`)
  const waiting = sqlite.prepare(`select 1 from jobs where photo_id = ? and status = 'queued'`)
  const queue = sqlite.prepare(`insert into jobs (id, type, photo_id, status, attempts, created_at) values (?, 'restore', ?, 'queued', 0, ?)`)
  return sqlite.transaction(() => {
    let count = 0
    for (const id of ids) {
      if (back.run(now, id).changes === 0) continue
      count++
      if (!waiting.get(id)) queue.run(newId(), id, now)
    }
    return count
  })()
}

/** The photos among these that are in the trash. */
export function trashedAmong(ctx: PipelineContext, ids: string[]): string[] {
  const inTrash = ctx.sqlite.prepare(`select 1 from photos where id = ? and status = 'trashed'`)
  return ids.filter(id => inTrash.get(id) !== undefined)
}

/** Deletes for good every photo that has been in the trash for thirty days. */
export async function emptyOldTrash(ctx: PipelineContext, now = Date.now()): Promise<DeleteResult> {
  const ids = (ctx.sqlite.prepare(`select id from photos where status = 'trashed' and trashed_at is not null and trashed_at <= ?`).all(now - TRASH_MS) as { id: string }[]).map(row => row.id)
  return ids.length > 0 ? deletePhotos(ctx, { ids }) : { count: 0, leftBehind: [] }
}

/** Deletes photos for good: no trash, no way back. */
export async function deletePhotos(ctx: PipelineContext, where: 'samples' | { ids: string[] }): Promise<DeleteResult> {
  const { sqlite, storage } = ctx
  const removed = sqlite.transaction(() => {
    const photos = where === 'samples'
      ? sqlite.prepare(`select id, original_path as original from photos where is_sample = 1`).all() as { id: string, original: string }[]
      : where.ids.map(id => sqlite.prepare(`select id, original_path as original from photos where id = ?`).get(id) as { id: string, original: string } | undefined)
          .filter(photo => photo !== undefined)
    const files: { area: 'originals' | 'derivatives', key: string }[] = []
    for (const photo of photos) {
      files.push({ area: 'originals', key: photo.original })
      // A HEIC has a JPEG beside it, made when it arrived.
      if (readableKey(photo.original) !== photo.original) files.push({ area: 'originals', key: readableKey(photo.original) })
      for (const row of sqlite.prepare(`select path from derivatives where photo_id = ?`).all(photo.id) as { path: string }[]) {
        files.push({ area: 'derivatives', key: row.path })
      }
      // Derivative, job, album-membership, and tag rows go with the photo (ON DELETE CASCADE).
      sqlite.prepare(`delete from photos where id = ?`).run(photo.id)
    }
    // Tags that no photo carries any more go too.
    sqlite.prepare(`delete from tags where id not in (select tag_id from photo_tags)`).run()
    return { count: photos.length, files }
  })()
  // Files last: a crash here leaves stray files, never rows without files.
  // One file that cannot be deleted (still open, on Windows) must not stop the rest.
  const leftBehind: string[] = []
  for (const file of removed.files) {
    await storage.delete(file.area, file.key).catch(() => leftBehind.push(`${file.area}/${file.key}`))
  }
  return { count: removed.count, leftBehind }
}
