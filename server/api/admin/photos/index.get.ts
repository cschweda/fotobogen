// The admin's list of photos, newest first, with processing status.
// With ?ids=a,b,c it returns just those photos (ids that no longer exist
// are simply absent), which is how the upload page follows its own files.
import { defineEventHandler, getQuery } from 'nuxt/server'
import { TRASH_MS } from '../../../pipeline/remove.ts'
import { getPipeline } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

interface Row {
  id: string, slug: string, title: string | null, filename: string, status: 'processing' | 'ready' | 'failed' | 'trashed', trashedAt: number | null
  width: number, height: number, isSample: number, createdAt: number, visibility: 'public' | 'hidden', alt: string | null, publishAt: number | null
  thumb: string | null, thumbWidth: number | null, thumbHeight: number | null, error: string | null
}

const LIMIT = 200
const MAX_IDS = 100

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { sqlite, storage } = getPipeline()
  const wanted = String(getQuery(event).ids ?? '').split(',').filter(id => /^[A-Za-z0-9_-]{1,32}$/.test(id)).slice(0, MAX_IDS)
  // ?show=hidden | scheduled | missing-alt | failed narrows the list.
  const FILTERS: Record<string, string> = { 'hidden': `p.visibility = 'hidden'`, 'scheduled': `p.visibility = 'public' and p.publish_at > ${Date.now()}`, 'missing-alt': `(p.alt is null or p.alt = '')`, 'failed': `p.status = 'failed'` }
  const narrowed = FILTERS[String(getQuery(event).show ?? '')]
  // ?album=<id> lists one album's photos.
  const album = String(getQuery(event).album ?? '')
  const inAlbum = /^[A-Za-z0-9_-]{1,32}$/.test(album) ? `p.id in (select photo_id from album_photos where album_id = ?)` : ''
  // ?trash=1 lists what is in the trash, most lately deleted first; otherwise the trash is left out.
  const trash = String(getQuery(event).trash ?? '') === '1'
  const conditions = [trash ? `p.status = 'trashed'` : `p.status <> 'trashed'`, wanted.length > 0 ? `p.id in (${wanted.map(() => '?').join(', ')})` : '', narrowed ?? '', inAlbum].filter(Boolean)
  const filter = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
  const rows = sqlite.prepare(`
    select p.id, p.slug, p.title, p.original_filename as filename, p.status, p.width, p.height,
      p.is_sample as isSample, p.created_at as createdAt, p.visibility, p.alt, p.publish_at as publishAt, p.trashed_at as trashedAt,
      d.path as thumb, d.width as thumbWidth, d.height as thumbHeight,
      (select error from jobs where photo_id = p.id and status = 'failed' order by created_at desc, rowid desc limit 1) as error
    from photos p
    left join derivatives d on d.photo_id = p.id and d.kind = 'thumb'
    ${filter}
    order by ${trash ? 'p.trashed_at desc' : 'p.sort_order desc'}
    limit ?
  `).all(...wanted, ...(inAlbum ? [album] : []), LIMIT) as Row[]
  const counts = sqlite.prepare(`
    select coalesce(sum(status <> 'trashed'), 0) as total, coalesce(sum(is_sample and status <> 'trashed'), 0) as samples,
      coalesce(sum(status = 'processing'), 0) as processing, coalesce(sum(status = 'failed'), 0) as failed,
      coalesce(sum(visibility = 'hidden' and status <> 'trashed'), 0) as hidden, coalesce(sum((alt is null or alt = '') and status <> 'trashed'), 0) as missingAlt,
      coalesce(sum(status = 'trashed'), 0) as trash
    from photos
  `).get() as { total: number, samples: number, processing: number, failed: number, hidden: number, missingAlt: number, trash: number }

  return {
    counts,
    photos: rows.map(row => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      filename: row.filename,
      status: row.status,
      width: row.width,
      height: row.height,
      isSample: row.isSample === 1,
      hidden: row.visibility === 'hidden',
      // Public, but not until this time.
      scheduledFor: row.visibility === 'public' && row.publishAt !== null && row.publishAt > Date.now() ? row.publishAt : null,
      missingAlt: !row.alt,
      createdAt: row.createdAt,
      thumb: row.thumb ? { url: storage.publicUrl(row.thumb), width: row.thumbWidth!, height: row.thumbHeight! } : null,
      error: row.status === 'failed' ? row.error : null,
      // In the trash: when it went there, and when it will be removed for good.
      ...(row.status === 'trashed' && row.trashedAt !== null ? { trashedAt: row.trashedAt, removedOn: row.trashedAt + TRASH_MS } : {}),
    })),
  }
})
