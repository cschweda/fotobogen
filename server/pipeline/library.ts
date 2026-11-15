// Changes the admin makes to photos already in the library: their words,
// whether they are shown, and their order. Deleting is in remove.ts.
import type { PipelineContext } from './context.ts'
import { slugify } from './slug.ts'

export interface PhotoEdit {
  title?: string | null
  description?: string | null
  alt?: string | null
  slug?: string
  /** Milliseconds since 1970, or null for "unknown". */
  takenAt?: number | null
  visibility?: 'public' | 'hidden'
}

export type EditResult
  = | { ok: true, slug: string }
    | { ok: false, reason: 'not-found' | 'invalid' | 'slug-taken', errors: Record<string, string> }

const LIMITS = { title: 200, description: 5000, alt: 500 }

function text(value: unknown, limit: number, field: string, errors: Record<string, string>): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    errors[field] = 'This must be text.'
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > limit) errors[field] = `Use ${limit} characters or fewer.`
  return trimmed || null
}

/** Applies the fields that were sent; fields left out are not touched. */
export function updatePhoto(ctx: PipelineContext, id: string, edit: Record<string, unknown>): EditResult {
  const { sqlite } = ctx
  const errors: Record<string, string> = {}
  const title = text(edit.title, LIMITS.title, 'title', errors)
  const description = text(edit.description, LIMITS.description, 'description', errors)
  const alt = text(edit.alt, LIMITS.alt, 'alt', errors)

  let slug: string | undefined
  if (edit.slug !== undefined) {
    slug = typeof edit.slug === 'string' ? slugify(edit.slug) : ''
    if (!slug) errors.slug = 'Use letters and numbers. This becomes the photo\'s web address.'
  }
  let takenAt: number | null | undefined
  if (edit.takenAt !== undefined) {
    if (edit.takenAt === null) takenAt = null
    else if (typeof edit.takenAt === 'number' && Number.isFinite(edit.takenAt) && Math.abs(edit.takenAt) < 8.64e15) takenAt = Math.round(edit.takenAt)
    else errors.takenAt = 'This is not a date.'
  }
  let visibility: 'public' | 'hidden' | undefined
  if (edit.visibility !== undefined) {
    if (edit.visibility === 'public' || edit.visibility === 'hidden') visibility = edit.visibility
    else errors.visibility = 'Choose public or hidden.'
  }
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors }

  return sqlite.transaction((): EditResult => {
    const current = sqlite.prepare(`select slug from photos where id = ?`).get(id) as { slug: string } | undefined
    if (!current) return { ok: false, reason: 'not-found', errors: {} }
    if (slug !== undefined && slug !== current.slug && sqlite.prepare(`select 1 from photos where slug = ? and id <> ?`).get(slug, id)) {
      return { ok: false, reason: 'slug-taken', errors: { slug: 'Another photo already has this address. Choose a different one.' } }
    }
    const sets: string[] = []
    const values: unknown[] = []
    const set = (column: string, value: unknown) => {
      if (value === undefined) return
      sets.push(`${column} = ?`)
      values.push(value)
    }
    set('title', title)
    set('description', description)
    set('alt', alt)
    set('slug', slug)
    set('taken_at', takenAt)
    set('visibility', visibility)
    if (sets.length > 0) sqlite.prepare(`update photos set ${sets.join(', ')}, updated_at = ? where id = ?`).run(...values, Date.now(), id)
    return { ok: true, slug: slug ?? current.slug }
  })()
}

/** Shows or hides several photos at once. Returns how many changed. */
export function setVisibility(ctx: PipelineContext, ids: string[], visibility: 'public' | 'hidden'): number {
  const update = ctx.sqlite.prepare(`update photos set visibility = ?, updated_at = ? where id = ? and visibility <> ?`)
  return ctx.sqlite.transaction(() => ids.reduce((changed, id) => changed + update.run(visibility, Date.now(), id, visibility).changes, 0))()
}

// The public grid shows the highest sort_order first, so "top" is highest.
const ordered = (ctx: PipelineContext): string[] =>
  (ctx.sqlite.prepare(`select id from photos order by sort_order desc, created_at desc`).all() as { id: string }[]).map(row => row.id)

function writeOrder(ctx: PipelineContext, ids: string[]): void {
  const update = ctx.sqlite.prepare(`update photos set sort_order = ? where id = ?`)
  ids.forEach((id, index) => update.run(ids.length - index, id))
}

/** Moves one photo within the order. False when there is no such photo. */
export function movePhoto(ctx: PipelineContext, id: string, to: 'up' | 'down' | 'top' | 'bottom'): boolean {
  return ctx.sqlite.transaction(() => {
    const ids = ordered(ctx)
    const from = ids.indexOf(id)
    if (from === -1) return false
    const target = to === 'top' ? 0 : to === 'bottom' ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, from + (to === 'up' ? -1 : 1)))
    ids.splice(target, 0, ...ids.splice(from, 1))
    writeOrder(ctx, ids)
    return true
  })()
}

/**
 * Puts `id` immediately before `beforeId` (or last, when `beforeId` is
 * null). This is what dragging a photo onto another does.
 */
export function placePhoto(ctx: PipelineContext, id: string, beforeId: string | null): boolean {
  return ctx.sqlite.transaction(() => {
    const ids = ordered(ctx)
    const from = ids.indexOf(id)
    if (from === -1 || id === beforeId) return from !== -1
    ids.splice(from, 1)
    const target = beforeId === null ? ids.length : ids.indexOf(beforeId)
    if (target === -1) return false
    ids.splice(target, 0, id)
    writeOrder(ctx, ids)
    return true
  })()
}
