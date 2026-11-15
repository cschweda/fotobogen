// The moments in a photo's life that webhooks can be told about.
import { getPipeline, getSqlite } from './app.ts'
import { getSetting, setSettings } from './settings.ts'
import { notify, type PhotoEvent } from './webhooks.ts'

interface Row { slug: string, title: string | null, status: string, visibility: string, publishAt: number | null, image: string | null }

function row(id: string): Row | undefined {
  return getSqlite().prepare(`
    select p.slug, p.title, p.status, p.visibility, p.publish_at as publishAt,
      (select path from derivatives where photo_id = p.id and kind = 'medium') as image
    from photos p where p.id = ?
  `).get(id) as Row | undefined
}

const describe = (photo: Row): PhotoEvent => ({
  slug: photo.slug,
  title: photo.title,
  path: `/photo/${photo.slug}`,
  image: photo.image ? getPipeline().storage.publicUrl(photo.image) : null,
})

/** Whether visitors can see the photo right now. */
export function isLive(id: string): boolean {
  const photo = row(id)
  return photo !== undefined && photo.status === 'ready' && photo.visibility === 'public' && (photo.publishAt === null || photo.publishAt <= Date.now())
}

export function photoUploaded(id: string): void {
  const photo = row(id)
  if (photo) notify('photo.uploaded', describe(photo))
}

/** Call when a photo has just become visible to visitors. */
export function photoPublished(id: string): void {
  const photo = row(id)
  if (photo && isLive(id)) notify('photo.published', describe(photo))
}

/** What to say about photos that are about to be deleted. Call before deleting, then `photosDeleted` after. */
export function beforeDelete(ids: string[]): PhotoEvent[] {
  return ids.map(row).filter(photo => photo !== undefined).map(photo => ({ ...describe(photo), image: null }))
}
export function photosDeleted(photos: PhotoEvent[]): void {
  for (const photo of photos) notify('photo.deleted', photo)
}

/**
 * Scheduled photos go live without anyone doing anything, so nothing would
 * announce them. Once a minute, announce those whose time has come since
 * the last look. The time of the last look is kept across restarts.
 */
export function watchSchedule(): void {
  const look = () => {
    try {
      const now = Date.now()
      const since = getSetting<number>('webhooks.last_scan', now)
      const due = getSqlite().prepare(`select id from photos where status = 'ready' and visibility = 'public' and publish_at > ? and publish_at <= ?`).all(since, now) as { id: string }[]
      setSettings({ 'webhooks.last_scan': now })
      for (const { id } of due) photoPublished(id)
    }
    catch { /* try again in a minute */ }
  }
  look()
  setInterval(look, 60_000).unref()
}
