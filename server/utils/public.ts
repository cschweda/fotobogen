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

/**
 * The test every public query applies: processed, public, and, if it was
 * scheduled, past its time. Worked out at the moment of the query, so a
 * scheduled photo appears by itself when its time comes.
 */
const visible = (): string => `p.status = 'ready' and p.visibility = 'public' and (p.publish_at is null or p.publish_at <= ${Date.now()})`

function placeholder(thumbhash: string | null): string | null {
  if (!thumbhash) return null
  try {
    return thumbHashToDataURL(Buffer.from(thumbhash, 'base64'))
  }
  catch {
    return null
  }
}

/** Which photos a grid shows: all of them, one album's, or one tag's. */
export type Scope = { album: string } | { tag: string } | undefined

export function publicTiles(page: number, scope?: Scope): { tiles: Tile[], total: number, pages: number } {
  const { sqlite, storage } = getPipeline()
  // An album keeps its own order; everything else follows the library's.
  const from = scope && 'album' in scope
    ? `from photos p join album_photos ap on ap.photo_id = p.id and ap.album_id = ?`
    : scope && 'tag' in scope
      ? `from photos p join photo_tags pt on pt.photo_id = p.id and pt.tag_id = ?`
      : `from photos p`
  const order = scope && 'album' in scope ? `ap.position` : `p.sort_order desc`
  const key = scope ? ['album' in scope ? scope.album : scope.tag] : []

  const { total } = sqlite.prepare(`select count(*) as total ${from} where ${visible()}`).get(...key) as { total: number }
  const rows = sqlite.prepare(`
    select p.slug, p.title, p.alt, p.thumbhash,
      t.path as thumbPath, t.width as thumbWidth, t.height as thumbHeight,
      s.path as squarePath, s.width as squareWidth, s.height as squareHeight
    ${from}
    join derivatives t on t.photo_id = p.id and t.kind = 'thumb'
    join derivatives s on s.photo_id = p.id and s.kind = 'square'
    where ${visible()}
    order by ${order}
    limit ? offset ?
  `).all(...key, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Row[]
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

export interface PublicAlbum {
  id: string
  slug: string
  title: string
  description: string | null
  /** Public photos in it. */
  count: number
  cover: { url: string, width: number, height: number } | null
}

/** Public albums that have at least one photo a visitor may see. */
export function publicAlbums(): PublicAlbum[] {
  const { sqlite, storage } = getPipeline()
  const albums = sqlite.prepare(`
    select a.id, a.slug, a.title, a.description, a.cover_photo_id as coverId,
      (select count(*) from album_photos ap join photos p on p.id = ap.photo_id where ap.album_id = a.id and ${visible()}) as count
    from albums a where a.visibility = 'public' order by a.sort_order desc
  `).all() as { id: string, slug: string, title: string, description: string | null, coverId: string | null, count: number }[]
  // The chosen cover if a visitor may see it, else the album's first visible photo.
  const cover = sqlite.prepare(`
    select d.path, d.width, d.height from album_photos ap
    join photos p on p.id = ap.photo_id
    join derivatives d on d.photo_id = p.id and d.kind = 'square'
    where ap.album_id = ? and ${visible()}
    order by (p.id = ?) desc, ap.position limit 1
  `)
  return albums.filter(album => album.count > 0).map(({ coverId, ...album }) => {
    const picture = cover.get(album.id, coverId ?? '') as { path: string, width: number, height: number } | undefined
    return { ...album, cover: picture ? { url: storage.publicUrl(picture.path), width: picture.width, height: picture.height } : null }
  })
}

export const publicAlbum = (slug: string): PublicAlbum | null => publicAlbums().find(album => album.slug === slug) ?? null

/** A tag, if any photo a visitor may see carries it. */
export function publicTag(slug: string): { id: string, slug: string, name: string } | null {
  const { sqlite } = getPipeline()
  const tag = sqlite.prepare(`
    select t.id, t.slug, t.name from tags t
    where t.slug = ? and exists (select 1 from photo_tags pt join photos p on p.id = pt.photo_id where pt.tag_id = t.id and ${visible()})
  `).get(slug) as { id: string, slug: string, name: string } | undefined
  return tag ?? null
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
  tags: { slug: string, name: string }[]
  /** Public albums this photo is in. */
  albums: { slug: string, title: string }[]
  previous: string | null
  next: string | null
}

export function publicPhoto(slug: string): PublicPhoto | null {
  const { sqlite, storage } = getPipeline()
  const photo = sqlite.prepare(`
    select p.id, p.slug, p.title, p.description, p.alt, p.thumbhash, p.taken_at as takenAt, p.sort_order as sortOrder,
      p.camera, p.lens, p.focal_length as focalLength, p.aperture, p.shutter, p.iso, p.lat, p.lng
    from photos p where p.slug = ? and ${visible()}
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
    .prepare(`select p.slug from photos p where ${visible()} and p.sort_order ${comparison} ? order by p.sort_order ${direction} limit 1`)
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
    tags: sqlite.prepare(`select t.slug, t.name from tags t join photo_tags pt on pt.tag_id = t.id where pt.photo_id = ? order by t.name collate nocase`).all(photo.id) as { slug: string, name: string }[],
    albums: sqlite.prepare(`select a.slug, a.title from albums a join album_photos ap on ap.album_id = a.id where ap.photo_id = ? and a.visibility = 'public' order by a.title collate nocase`).all(photo.id) as { slug: string, title: string }[],
    previous: neighbour('>', 'asc'),
    next: neighbour('<', 'desc'),
  }
}

export interface Slide {
  slug: string
  title: string | null
  description: string | null
  alt: string
  takenAt: number | null
  /** Camera and exposure on one line, when the site shows camera details. */
  camera: string | null
  /** The largest copy first; the browser picks by screen size. */
  images: { url: string, width: number, height: number }[]
}

const SLIDE_LIMIT = 500

/** The photos a slideshow plays: everything a visitor may see, or one album's or tag's. Never a location. */
export function publicSlides(scope?: Scope): Slide[] {
  const { sqlite, storage } = getPipeline()
  const from = scope && 'album' in scope
    ? `from photos p join album_photos ap on ap.photo_id = p.id and ap.album_id = ?`
    : scope && 'tag' in scope ? `from photos p join photo_tags pt on pt.photo_id = p.id and pt.tag_id = ?` : `from photos p`
  const order = scope && 'album' in scope ? `ap.position` : `p.sort_order desc`
  const key = scope ? ['album' in scope ? scope.album : scope.tag] : []
  const rows = sqlite.prepare(`
    select p.id, p.slug, p.title, p.description, p.alt, p.taken_at as takenAt,
      p.camera, p.lens, p.focal_length as focalLength, p.aperture, p.shutter, p.iso
    ${from} where ${visible()} order by ${order} limit ?
  `).all(...key, SLIDE_LIMIT) as {
    id: string, slug: string, title: string | null, description: string | null, alt: string | null, takenAt: number | null
    camera: string | null, lens: string | null, focalLength: string | null, aperture: string | null, shutter: string | null, iso: number | null
  }[]
  const showExif = getSetting('privacy.show_exif', true)
  const copies = sqlite.prepare(`select path, width, height from derivatives where photo_id = ? and kind in ('medium', 'large') order by width`)
  return rows.map(row => ({
    slug: row.slug,
    title: row.title,
    description: row.description,
    alt: row.alt ?? row.title ?? '',
    takenAt: row.takenAt,
    camera: showExif
      ? [row.camera, row.lens, row.focalLength, row.aperture, row.shutter, row.iso ? `ISO ${row.iso}` : null].filter(Boolean).join(', ') || null
      : null,
    images: (copies.all(row.id) as { path: string, width: number, height: number }[]).map(copy => ({ url: storage.publicUrl(copy.path), width: copy.width, height: copy.height })),
  })).filter(slide => slide.images.length > 0)
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
    select p.slug, p.title, p.description, coalesce(p.publish_at, p.created_at) as createdAt, p.updated_at as updatedAt, d.path
    from photos p left join derivatives d on d.photo_id = p.id and d.kind = 'medium'
    where ${visible()} order by p.sort_order desc limit ?
  `).all(limit) as { slug: string, title: string | null, description: string | null, createdAt: number, updatedAt: number, path: string | null }[]
  return rows.map(({ path, ...row }) => ({ ...row, image: path ? storage.publicUrl(path) : null }))
}
