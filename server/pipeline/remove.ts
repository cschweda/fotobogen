// Deleting photos: the rows, then the files they pointed at.
import type { PipelineContext } from './context.ts'

export interface DeleteResult {
  count: number
  /** Files that could not be deleted; their rows are gone. */
  leftBehind: string[]
}

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
