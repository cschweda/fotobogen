// Deleting photos: the rows, then the files they pointed at.
import type { PipelineContext } from './context.ts'

export async function deletePhotos(ctx: PipelineContext, where: 'samples' | { ids: string[] }): Promise<number> {
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
      // Derivative and job rows go with the photo (ON DELETE CASCADE).
      sqlite.prepare(`delete from photos where id = ?`).run(photo.id)
    }
    return { count: photos.length, files }
  })()
  // Files last: a crash here leaves stray files, never rows without files.
  for (const file of removed.files) await storage.delete(file.area, file.key)
  return removed.count
}
