// Every album, hidden ones included, with how many photos each holds.
import { defineEventHandler } from 'nuxt/server'
import { getPipeline } from '../../../utils/app.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { sqlite, storage } = getPipeline()
  const albums = sqlite.prepare(`
    select a.id, a.slug, a.title, a.description, a.visibility, a.cover_photo_id as coverPhotoId, a.private_token as token,
      (select count(*) from album_photos ap join photos p on p.id = ap.photo_id and p.status <> 'trashed' where ap.album_id = a.id) as count,
      (select d.path from album_photos ap join derivatives d on d.photo_id = ap.photo_id and d.kind = 'square'
        join photos p on p.id = ap.photo_id and p.status <> 'trashed'
        where ap.album_id = a.id order by (ap.photo_id = a.cover_photo_id) desc, ap.position limit 1) as cover
    from albums a order by a.sort_order desc
  `).all() as { id: string, slug: string, title: string, description: string | null, visibility: 'public' | 'hidden' | 'private', coverPhotoId: string | null, token: string | null, count: number, cover: string | null }[]
  return {
    albums: albums.map(({ token, ...album }) => ({
      ...album,
      cover: album.cover ? storage.publicUrl(album.cover) : null,
      // A private album's link, for its owner to pass on. A demo visitor is not shown it: whoever has it sees the album.
      privateLink: album.visibility === 'private' && token && !admin.demo ? `/private/${token}` : null,
    })),
  }
})
