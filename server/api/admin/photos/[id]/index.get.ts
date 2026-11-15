// One photo, for the edit screen: its details, its recipe, and its medium copy.
import { siteOrigin } from '../../../../utils/public.ts'
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { siteRecipe } from '../../../../pipeline/render.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { sqlite, storage, modules } = getPipeline()
  const photo = sqlite.prepare(`
    select p.id, p.slug, p.title, p.description, p.alt, p.visibility, p.publish_at as publishAt, p.taken_at as takenAt, p.bytes, p.mime, p.license, p.allow_download as allowDownload,
      p.camera, p.lens, p.focal_length as focalLength, p.aperture, p.shutter, p.iso, p.lat, p.lng,
      p.original_filename as filename, p.status, p.width, p.height, p.recipe_json as recipe,
      d.path, d.width as mediumWidth, d.height as mediumHeight
    from photos p left join derivatives d on d.photo_id = p.id and d.kind = 'medium'
    where p.id = ?
  `).get(getRouterParam(event, 'id') ?? '') as {
    id: string, slug: string, title: string | null, filename: string, status: string, width: number, height: number
    description: string | null, alt: string | null, visibility: 'public' | 'hidden', publishAt: number | null, takenAt: number | null, bytes: number, mime: string, license: string | null, allowDownload: number | null
    camera: string | null, lens: string | null, focalLength: string | null, aperture: string | null, shutter: string | null, iso: number | null
    lat: number | null, lng: number | null
    recipe: string | null, path: string | null, mediumWidth: number | null, mediumHeight: number | null
  } | undefined
  if (!photo) return fail(event, 404, 'There is no such photo.')

  const origin = siteOrigin(event)
  const own = photo.recipe === null ? null : modules!.cleanRecipe(JSON.parse(photo.recipe))
  const site = siteRecipe(getPipeline())
  const recipe = own ?? site
  return {
    id: photo.id,
    slug: photo.slug,
    title: photo.title,
    description: photo.description,
    alt: photo.alt,
    visibility: photo.visibility,
    publishAt: photo.publishAt,
    // null: follows the site's setting.
    license: photo.license,
    allowDownload: photo.allowDownload === null ? null : photo.allowDownload === 1,
    takenAt: photo.takenAt,
    // Read from the file when it was uploaded. Shown to the admin only; the
    // public site follows the privacy settings.
    details: {
      camera: photo.camera, lens: photo.lens, focalLength: photo.focalLength, aperture: photo.aperture, shutter: photo.shutter, iso: photo.iso,
      // Where a photo was taken is the owner's to know: a demo visitor is not shown it.
      location: !admin.demo && photo.lat !== null && photo.lng !== null ? { lat: photo.lat, lng: photo.lng } : null,
      bytes: photo.bytes, mime: photo.mime,
    },
    tags: (sqlite.prepare(`select t.name from tags t join photo_tags pt on pt.tag_id = t.id where pt.photo_id = ? order by t.name collate nocase`).all(photo.id) as { name: string }[]).map(tag => tag.name),
    albums: (sqlite.prepare(`select album_id as id from album_photos where photo_id = ?`).all(photo.id) as { id: string }[]).map(album => album.id),
    filename: photo.filename,
    status: photo.status,
    width: photo.width,
    height: photo.height,
    // The photo's own recipe; null when it follows the site-wide one.
    own,
    site,
    // What is actually applied.
    recipe,
    // Steps whose module is switched off or missing; they are skipped when rendering.
    skipped: modules!.skipped(recipe).map(step => `${step.module}/${step.transform}`),
    medium: photo.path ? { url: storage.publicUrl(photo.path), width: photo.mediumWidth!, height: photo.mediumHeight! } : null,
    // Full addresses, for pasting elsewhere: the photo's page, and each size of the picture.
    links: {
      origin,
      page: `${origin}/photo/${encodeURIComponent(photo.slug)}`,
      images: (sqlite.prepare(`select kind, path, width, height from derivatives where photo_id = ? order by width, kind`).all(photo.id) as { kind: string, path: string, width: number, height: number }[])
        .map(copy => ({ kind: copy.kind, url: origin + storage.publicUrl(copy.path), width: copy.width, height: copy.height })),
    },
  }
})
