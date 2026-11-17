// Albums and tags: two ways of grouping photos. An album is a named set
// the owner arranges; a tag is a short label, and exists only while some
// photo carries it.
import { randomBytes } from 'node:crypto'
import { newId } from '../core/ids.ts'
import type { PipelineContext } from './context.ts'
import { slugify, uniqueSlug } from './slug.ts'

export interface AlbumInput {
  title?: unknown
  description?: unknown
  slug?: unknown
  visibility?: unknown
  coverPhotoId?: unknown
  /** true: give a private album a new link, which ends the old one. */
  newPrivateLink?: unknown
}

/** The secret part of a private album's link: 32 characters, 192 bits, from the system's random source. */
export const newPrivateToken = (): string => randomBytes(24).toString('base64url')

export type AlbumResult
  = | { ok: true, id: string, slug: string }
    | { ok: false, reason: 'not-found' | 'invalid' | 'slug-taken', errors: Record<string, string> }

const TITLE_LIMIT = 120
const DESCRIPTION_LIMIT = 2000
const TAG_LIMIT = 40
const TAGS_PER_PHOTO = 30

function checkAlbum(input: AlbumInput, creating: boolean) {
  const errors: Record<string, string> = {}
  let title: string | undefined
  if (input.title !== undefined || creating) {
    title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) errors.title = 'Give the album a name.'
    else if (title.length > TITLE_LIMIT) errors.title = `Use ${TITLE_LIMIT} characters or fewer.`
  }
  let description: string | null | undefined
  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== 'string') errors.description = 'This must be text.'
    else {
      description = (input.description ?? '').trim() || null
      if (description && description.length > DESCRIPTION_LIMIT) errors.description = `Use ${DESCRIPTION_LIMIT} characters or fewer.`
    }
  }
  let slug: string | undefined
  if (input.slug !== undefined) {
    slug = typeof input.slug === 'string' ? slugify(input.slug) : ''
    if (!slug) errors.slug = 'Use letters and numbers. This becomes the album\'s web address.'
  }
  let visibility: 'public' | 'hidden' | 'private' | undefined
  if (input.visibility !== undefined) {
    if (input.visibility === 'public' || input.visibility === 'hidden' || input.visibility === 'private') visibility = input.visibility
    else errors.visibility = 'Choose public, hidden, or private.'
  }
  return { errors, title, description, slug, visibility }
}

export function createAlbum(ctx: PipelineContext, input: AlbumInput): AlbumResult {
  const { sqlite } = ctx
  const checked = checkAlbum(input, true)
  if (Object.keys(checked.errors).length > 0) return { ok: false, reason: 'invalid', errors: checked.errors }
  return sqlite.transaction((): AlbumResult => {
    const id = newId()
    const slug = uniqueSlug(checked.slug ?? slugify(checked.title!), id, candidate => sqlite.prepare(`select 1 from albums where slug = ?`).get(candidate) !== undefined)
    const { next } = sqlite.prepare(`select coalesce(max(sort_order), 0) + 1 as next from albums`).get() as { next: number }
    const now = Date.now()
    sqlite.prepare(`insert into albums (id, slug, title, description, visibility, private_token, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, slug, checked.title, checked.description ?? null, checked.visibility ?? 'public', checked.visibility === 'private' ? newPrivateToken() : null, next, now, now)
    return { ok: true, id, slug }
  })()
}

export function updateAlbum(ctx: PipelineContext, id: string, input: AlbumInput): AlbumResult {
  const { sqlite } = ctx
  const checked = checkAlbum(input, false)
  let cover: string | null | undefined
  if (input.coverPhotoId !== undefined) {
    if (input.coverPhotoId === null) cover = null
    else if (typeof input.coverPhotoId === 'string' && sqlite.prepare(`select 1 from album_photos where album_id = ? and photo_id = ?`).get(id, input.coverPhotoId)) cover = input.coverPhotoId
    else checked.errors.coverPhotoId = 'The cover must be a photo in this album.'
  }
  if (Object.keys(checked.errors).length > 0) return { ok: false, reason: 'invalid', errors: checked.errors }
  return sqlite.transaction((): AlbumResult => {
    const current = sqlite.prepare(`select slug, visibility, private_token as token from albums where id = ?`).get(id) as { slug: string, visibility: string, token: string | null } | undefined
    if (!current) return { ok: false, reason: 'not-found', errors: {} }
    // A private album has a link; nothing else does. Leaving "private" ends the link for good:
    // made private again, the album gets a new one, never the old.
    const becomes = checked.visibility ?? current.visibility
    let token: string | null | undefined
    if (input.newPrivateLink === true) {
      if (becomes !== 'private') return { ok: false, reason: 'invalid', errors: { newPrivateLink: 'Only a private album has a link.' } }
      token = newPrivateToken()
    }
    else if (becomes === 'private' && !current.token) token = newPrivateToken()
    else if (becomes !== 'private' && current.token) token = null
    if (checked.slug !== undefined && checked.slug !== current.slug && sqlite.prepare(`select 1 from albums where slug = ? and id <> ?`).get(checked.slug, id)) {
      return { ok: false, reason: 'slug-taken', errors: { slug: 'Another album already has this address. Choose a different one.' } }
    }
    const sets: string[] = []
    const values: unknown[] = []
    for (const [column, value] of [['title', checked.title], ['description', checked.description], ['slug', checked.slug], ['visibility', checked.visibility], ['cover_photo_id', cover], ['private_token', token]] as const) {
      if (value === undefined) continue
      sets.push(`${column} = ?`)
      values.push(value)
    }
    if (sets.length > 0) sqlite.prepare(`update albums set ${sets.join(', ')}, updated_at = ? where id = ?`).run(...values, Date.now(), id)
    return { ok: true, id, slug: checked.slug ?? current.slug }
  })()
}

/** Deletes the album. Its photos stay in the library. */
export function deleteAlbum(ctx: PipelineContext, id: string): boolean {
  return ctx.sqlite.prepare(`delete from albums where id = ?`).run(id).changes > 0
}

/** Adds photos to the end of an album; ones already in it stay where they are. Returns how many were added. */
export function addToAlbum(ctx: PipelineContext, albumId: string, photoIds: string[]): number | null {
  const { sqlite } = ctx
  return sqlite.transaction(() => {
    if (!sqlite.prepare(`select 1 from albums where id = ?`).get(albumId)) return null
    let { position } = sqlite.prepare(`select coalesce(max(position), 0) as position from album_photos where album_id = ?`).get(albumId) as { position: number }
    const insert = sqlite.prepare(`insert or ignore into album_photos (album_id, photo_id, position) select ?, id, ? from photos where id = ?`)
    let added = 0
    for (const photoId of photoIds) added += insert.run(albumId, ++position, photoId).changes
    if (added > 0) sqlite.prepare(`update albums set updated_at = ? where id = ?`).run(Date.now(), albumId)
    return added
  })()
}

export function removeFromAlbum(ctx: PipelineContext, albumId: string, photoIds: string[]): number {
  const remove = ctx.sqlite.prepare(`delete from album_photos where album_id = ? and photo_id = ?`)
  return ctx.sqlite.transaction(() => photoIds.reduce((removed, photoId) => removed + remove.run(albumId, photoId).changes, 0))()
}

/** Makes the photo a member of exactly these albums. Unknown album ids are ignored. */
export function setPhotoAlbums(ctx: PipelineContext, photoId: string, albumIds: string[]): void {
  const { sqlite } = ctx
  sqlite.transaction(() => {
    const current = new Set((sqlite.prepare(`select album_id as id from album_photos where photo_id = ?`).all(photoId) as { id: string }[]).map(row => row.id))
    const wanted = new Set(albumIds)
    for (const id of current) if (!wanted.has(id)) removeFromAlbum(ctx, id, [photoId])
    for (const id of wanted) if (!current.has(id)) addToAlbum(ctx, id, [photoId])
  })()
}

/** Tidies what was typed into a tag: spaces collapsed, length capped. Null when nothing usable is left. */
export function cleanTag(raw: unknown): { name: string, slug: string } | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').replace(/^#/, '').trim().slice(0, TAG_LIMIT).trim()
  const slug = slugify(name)
  return name && slug ? { name, slug } : null
}

function tagId(ctx: PipelineContext, tag: { name: string, slug: string }): string {
  const existing = ctx.sqlite.prepare(`select id from tags where slug = ?`).get(tag.slug) as { id: string } | undefined
  if (existing) return existing.id
  const id = newId()
  ctx.sqlite.prepare(`insert into tags (id, slug, name) values (?, ?, ?)`).run(id, tag.slug, tag.name)
  return id
}

const dropUnusedTags = (ctx: PipelineContext) => ctx.sqlite.prepare(`delete from tags where id not in (select tag_id from photo_tags)`).run()

/** Gives the photo exactly these tags. Two spellings of one tag ("Sea", "sea") count once. Returns the tags kept. */
export function setPhotoTags(ctx: PipelineContext, photoId: string, names: unknown[]): string[] {
  const { sqlite } = ctx
  return sqlite.transaction(() => {
    const wanted = new Map<string, { name: string, slug: string }>()
    for (const raw of names) {
      const tag = cleanTag(raw)
      if (tag && !wanted.has(tag.slug) && wanted.size < TAGS_PER_PHOTO) wanted.set(tag.slug, tag)
    }
    sqlite.prepare(`delete from photo_tags where photo_id = ?`).run(photoId)
    const insert = sqlite.prepare(`insert into photo_tags (photo_id, tag_id) select id, ? from photos where id = ?`)
    for (const tag of wanted.values()) insert.run(tagId(ctx, tag), photoId)
    dropUnusedTags(ctx)
    return (sqlite.prepare(`select t.name from tags t join photo_tags pt on pt.tag_id = t.id where pt.photo_id = ? order by t.name collate nocase`).all(photoId) as { name: string }[]).map(row => row.name)
  })()
}

/** Adds one tag to several photos. Returns how many gained it, or null for an unusable tag. */
export function addTag(ctx: PipelineContext, photoIds: string[], raw: unknown): number | null {
  const tag = cleanTag(raw)
  if (!tag) return null
  return ctx.sqlite.transaction(() => {
    const id = tagId(ctx, tag)
    const insert = ctx.sqlite.prepare(`insert or ignore into photo_tags (photo_id, tag_id) select id, ? from photos where id = ?`)
    const added = photoIds.reduce((count, photoId) => count + insert.run(id, photoId).changes, 0)
    dropUnusedTags(ctx)
    return added
  })()
}

/** After photos are deleted, tags nobody carries any more are dropped. */
export function tidyTags(ctx: PipelineContext): void {
  dropUnusedTags(ctx)
}
