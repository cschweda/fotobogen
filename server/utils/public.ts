// What the public pages and feeds may know about photos. Only photos that
// are processed and public are ever returned from here.
import { thumbHashToDataURL } from 'thumbhash'
import { resolveSettings } from '../core/config.ts'
import { getRequestHeader, getRequestURL, type RequestEvent } from 'nuxt/server'
import { getPipeline } from './app.ts'
import { getSetting } from './settings.ts'

export const PAGE_SIZE = 30
/** Rows per column-width in the masonry grid; the skin's CSS uses the same number. */
const MASONRY_UNITS = 20

export interface Tile {
  slug: string
  title: string | null
  /** Text for the image's alt attribute: alt text, else the title, else empty. */
  alt: string
  /** A tiny blurred version, shown until the image loads. */
  placeholder: string | null
  thumb: { url: string, width: number, height: number }
  square: { url: string, width: number, height: number }
  /** Rows this photo spans in the masonry grid, from its shape. */
  span: number
}

interface Row {
  slug: string, title: string | null, alt: string | null, thumbhash: string | null
  thumbPath: string, thumbWidth: number, thumbHeight: number
  squarePath: string, squareWidth: number, squareHeight: number
}

const VISIBLE = `p.status = 'ready' and p.visibility = 'public'`

function placeholder(thumbhash: string | null): string | null {
  if (!thumbhash) return null
  try {
    return thumbHashToDataURL(Buffer.from(thumbhash, 'base64'))
  }
  catch {
    return null
  }
}

export function publicTiles(page: number): { tiles: Tile[], total: number, pages: number } {
  const { sqlite, storage } = getPipeline()
  const { total } = sqlite.prepare(`select count(*) as total from photos p where ${VISIBLE}`).get() as { total: number }
  const rows = sqlite.prepare(`
    select p.slug, p.title, p.alt, p.thumbhash,
      t.path as thumbPath, t.width as thumbWidth, t.height as thumbHeight,
      s.path as squarePath, s.width as squareWidth, s.height as squareHeight
    from photos p
    join derivatives t on t.photo_id = p.id and t.kind = 'thumb'
    join derivatives s on s.photo_id = p.id and s.kind = 'square'
    where ${VISIBLE}
    order by p.sort_order desc
    limit ? offset ?
  `).all(PAGE_SIZE, (page - 1) * PAGE_SIZE) as Row[]
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    tiles: rows.map(row => ({
      slug: row.slug,
      title: row.title,
      alt: row.alt ?? row.title ?? '',
      placeholder: placeholder(row.thumbhash),
      thumb: { url: storage.publicUrl(row.thumbPath), width: row.thumbWidth, height: row.thumbHeight },
      square: { url: storage.publicUrl(row.squarePath), width: row.squareWidth, height: row.squareHeight },
      // Very tall and very wide photos are held within sensible bounds.
      span: Math.min(60, Math.max(5, Math.round(MASONRY_UNITS * row.thumbHeight / row.thumbWidth))),
    })),
  }
}

export interface PublicPhoto {
  slug: string
  title: string | null
  description: string | null
  alt: string
  placeholder: string | null
  takenAt: number | null
  /** Camera details, only when the site shows them. */
  exif: { camera: string | null, lens: string | null, focalLength: string | null, aperture: string | null, shutter: string | null, iso: number | null } | null
  /** Where it was taken, only when the site shows locations. */
  location: { lat: number, lng: number } | null
  images: { url: string, width: number, height: number }[]
  previous: string | null
  next: string | null
}

export function publicPhoto(slug: string): PublicPhoto | null {
  const { sqlite, storage } = getPipeline()
  const photo = sqlite.prepare(`
    select p.id, p.slug, p.title, p.description, p.alt, p.thumbhash, p.taken_at as takenAt, p.sort_order as sortOrder,
      p.camera, p.lens, p.focal_length as focalLength, p.aperture, p.shutter, p.iso, p.lat, p.lng
    from photos p where p.slug = ? and ${VISIBLE}
  `).get(slug) as (Record<string, never> & {
    id: string, slug: string, title: string | null, description: string | null, alt: string | null, thumbhash: string | null
    takenAt: number | null, sortOrder: number, camera: string | null, lens: string | null, focalLength: string | null
    aperture: string | null, shutter: string | null, iso: number | null, lat: number | null, lng: number | null
  }) | undefined
  if (!photo) return null

  const images = sqlite.prepare(`select path, width, height from derivatives where photo_id = ? and kind in ('medium', 'large') order by width`)
    .all(photo.id) as { path: string, width: number, height: number }[]
  // The grid runs from the highest sort_order down, so "previous" is the one above.
  const neighbour = (comparison: '>' | '<', direction: 'asc' | 'desc') => (sqlite
    .prepare(`select p.slug from photos p where ${VISIBLE} and p.sort_order ${comparison} ? order by p.sort_order ${direction} limit 1`)
    .get(photo.sortOrder) as { slug: string } | undefined)?.slug ?? null

  return {
    slug: photo.slug,
    title: photo.title,
    description: photo.description,
    alt: photo.alt ?? photo.title ?? '',
    placeholder: placeholder(photo.thumbhash),
    takenAt: photo.takenAt,
    exif: getSetting('privacy.show_exif', true)
      ? { camera: photo.camera, lens: photo.lens, focalLength: photo.focalLength, aperture: photo.aperture, shutter: photo.shutter, iso: photo.iso }
      : null,
    location: getSetting('privacy.show_location', false) && photo.lat !== null && photo.lng !== null ? { lat: photo.lat, lng: photo.lng } : null,
    images: images.map(image => ({ url: storage.publicUrl(image.path), width: image.width, height: image.height })),
    previous: neighbour('>', 'asc'),
    next: neighbour('<', 'desc'),
  }
}

/** The site's own address as visitors see it, for links in feeds and social cards. */
export function siteOrigin(event: RequestEvent): string {
  const url = getRequestURL(event)
  // Behind our own proxy, the visitor's scheme is in X-Forwarded-Proto.
  const forwarded = resolveSettings(process.env).trustProxy ? getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim() : undefined
  const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol
  return `${protocol}//${getRequestHeader(event, 'host') ?? url.host}`
}

export const escapeXml = (text: string): string =>
  text.replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' })[character]!)

/** The newest public photos, for the feed and the sitemap. */
export function recentPhotos(limit: number): { slug: string, title: string | null, description: string | null, createdAt: number, updatedAt: number, image: string | null }[] {
  const { sqlite, storage } = getPipeline()
  const rows = sqlite.prepare(`
    select p.slug, p.title, p.description, p.created_at as createdAt, p.updated_at as updatedAt, d.path
    from photos p left join derivatives d on d.photo_id = p.id and d.kind = 'medium'
    where ${VISIBLE} order by p.sort_order desc limit ?
  `).all(limit) as { slug: string, title: string | null, description: string | null, createdAt: number, updatedAt: number, path: string | null }[]
  return rows.map(({ path, ...row }) => ({ ...row, image: path ? storage.publicUrl(path) : null }))
}
