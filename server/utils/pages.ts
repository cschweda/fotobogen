// Pages and the menu, as the server keeps them (shared/page-text.ts has the rules).
import { newId } from '../core/ids.ts'
import { slugify, uniqueSlug } from '../pipeline/slug.ts'
import { cleanMenuLinks, MAX_PAGES, PAGE_BODY_MAX, PAGE_TITLE_MAX, RESERVED_SLUGS, safeHref, type MenuLink } from '../../shared/page-text.ts'
import { getSqlite } from './app.ts'
import { getSetting } from './settings.ts'

export const MENU_KEY = 'site.menu'

export interface PageRow { id: string, slug: string, title: string, body: string, visibility: 'public' | 'hidden', inMenu: boolean, updatedAt: number }
export type PageResult = { ok: true, id: string, slug: string } | { ok: false, reason: 'invalid' | 'not-found' | 'slug-taken' | 'too-many', errors: Record<string, string> }

const COLUMNS = `id, slug, title, body, visibility, in_menu as inMenu, updated_at as updatedAt`
const row = (found: unknown): PageRow => ({ ...(found as PageRow), inMenu: (found as { inMenu: number }).inMenu === 1 })

/** Every page, in the order of the menu. */
export const listPages = (): PageRow[] => getSqlite().prepare(`select ${COLUMNS} from pages order by sort_order, created_at`).all().map(row)

/** A page a visitor may read, by its address. */
export function publicPage(slug: string): PageRow | null {
  const found = getSqlite().prepare(`select ${COLUMNS} from pages where slug = ? and visibility = 'public'`).get(slug)
  return found ? row(found) : null
}

/** What the owner added to the site's menu: public pages marked for it, then their own links. */
export function siteMenu(): { label: string, href: string, external: boolean }[] {
  const pages = getSqlite().prepare(`select slug, title from pages where visibility = 'public' and in_menu = 1 order by sort_order, created_at`).all() as { slug: string, title: string }[]
  // Read through the same checks as when saving, so a hand-edited database cannot put a bad address in the menu.
  const links = cleanMenuLinks(getSetting<unknown>(MENU_KEY, [])).links
  return [
    ...pages.map(page => ({ label: page.title, href: `/${page.slug}`, external: false })),
    ...links.map(link => ({ label: link.label, href: link.url, external: safeHref(link.url)?.external ?? false })),
  ]
}
export const menuLinks = (): MenuLink[] => cleanMenuLinks(getSetting<unknown>(MENU_KEY, [])).links

interface Checked { errors: Record<string, string>, title?: string, body?: string, slug?: string, visibility?: 'public' | 'hidden', inMenu?: boolean }

function check(input: Record<string, unknown>, creating: boolean): Checked {
  const errors: Record<string, string> = {}
  const checked: Checked = { errors }
  if (input.title !== undefined || creating) {
    const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : ''
    if (title === '') errors.title = 'Give the page a title.'
    else if (title.length > PAGE_TITLE_MAX) errors.title = `Keep the title to ${PAGE_TITLE_MAX} characters.`
    else checked.title = title
  }
  if (input.body !== undefined) {
    if (typeof input.body !== 'string') errors.body = 'The page\'s text must be text.'
    else if (input.body.length > PAGE_BODY_MAX) errors.body = `This is longer than a page can be (${PAGE_BODY_MAX.toLocaleString('en')} characters).`
    else checked.body = input.body.replace(/\r\n?/g, '\n')
  }
  if (input.slug !== undefined) {
    const slug = typeof input.slug === 'string' ? slugify(input.slug) : ''
    if (!slug) errors.slug = 'Use letters and numbers. This becomes the page\'s web address.'
    else if (RESERVED_SLUGS.has(slug)) errors.slug = `"/${slug}" is used by the site itself. Choose another address.`
    else checked.slug = slug
  }
  if (input.visibility !== undefined) {
    if (input.visibility === 'public' || input.visibility === 'hidden') checked.visibility = input.visibility
    else errors.visibility = 'Choose public or hidden.'
  }
  if (input.inMenu !== undefined) {
    if (typeof input.inMenu === 'boolean') checked.inMenu = input.inMenu
    else errors.inMenu = 'Say whether the page is in the menu.'
  }
  return checked
}

export function createPage(input: Record<string, unknown>): PageResult {
  const sqlite = getSqlite()
  const checked = check(input, true)
  if (Object.keys(checked.errors).length > 0) return { ok: false, reason: 'invalid', errors: checked.errors }
  return sqlite.transaction((): PageResult => {
    const { count } = sqlite.prepare(`select count(*) as count from pages`).get() as { count: number }
    if (count >= MAX_PAGES) return { ok: false, reason: 'too-many', errors: { title: `A site can have ${MAX_PAGES} pages. Delete one first.` } }
    const id = newId()
    // An address made from the title steps aside for the site's own ("Albums" becomes /albums-page) and for other pages.
    let wanted = checked.slug ?? slugify(checked.title!)
    if (RESERVED_SLUGS.has(wanted)) wanted = `${wanted}-page`
    const slug = uniqueSlug(wanted || `page-${slugify(id)}`, id, candidate => RESERVED_SLUGS.has(candidate) || sqlite.prepare(`select 1 from pages where slug = ?`).get(candidate) !== undefined)
    const { next } = sqlite.prepare(`select coalesce(max(sort_order), 0) + 1 as next from pages`).get() as { next: number }
    const now = Date.now()
    sqlite.prepare(`insert into pages (id, slug, title, body, visibility, in_menu, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, slug, checked.title, checked.body ?? '', checked.visibility ?? 'public', checked.inMenu === false ? 0 : 1, next, now, now)
    return { ok: true, id, slug }
  })()
}

export function updatePage(id: string, input: Record<string, unknown>): PageResult {
  const sqlite = getSqlite()
  const checked = check(input, false)
  if (Object.keys(checked.errors).length > 0) return { ok: false, reason: 'invalid', errors: checked.errors }
  return sqlite.transaction((): PageResult => {
    const current = sqlite.prepare(`select slug from pages where id = ?`).get(id) as { slug: string } | undefined
    if (!current) return { ok: false, reason: 'not-found', errors: {} }
    if (checked.slug !== undefined && checked.slug !== current.slug && sqlite.prepare(`select 1 from pages where slug = ? and id <> ?`).get(checked.slug, id)) {
      return { ok: false, reason: 'slug-taken', errors: { slug: 'Another page already has this address. Choose a different one.' } }
    }
    const sets: string[] = []
    const values: unknown[] = []
    for (const [column, value] of [['title', checked.title], ['body', checked.body], ['slug', checked.slug], ['visibility', checked.visibility], ['in_menu', checked.inMenu === undefined ? undefined : checked.inMenu ? 1 : 0]] as const) {
      if (value === undefined) continue
      sets.push(`${column} = ?`)
      values.push(value)
    }
    if (sets.length > 0) sqlite.prepare(`update pages set ${sets.join(', ')}, updated_at = ? where id = ?`).run(...values, Date.now(), id)
    return { ok: true, id, slug: checked.slug ?? current.slug }
  })()
}

export const deletePage = (id: string): boolean => getSqlite().prepare(`delete from pages where id = ?`).run(id).changes > 0

/** Moves a page one place up or down the order. False when there is no such page. */
export function movePage(id: string, to: 'up' | 'down'): boolean {
  const sqlite = getSqlite()
  return sqlite.transaction(() => {
    const ids = (sqlite.prepare(`select id from pages order by sort_order, created_at`).all() as { id: string }[]).map(found => found.id)
    const at = ids.indexOf(id)
    if (at === -1) return false
    const other = to === 'up' ? at - 1 : at + 1
    if (other >= 0 && other < ids.length) [ids[at], ids[other]] = [ids[other]!, ids[at]!]
    const place = sqlite.prepare(`update pages set sort_order = ? where id = ?`)
    ids.forEach((pageId, index) => place.run(index + 1, pageId))
    return true
  })()
}
