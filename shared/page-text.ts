// Pages (About, Contact, anything) and the links an owner adds to the menu.
//
// A page's text is plain text with a little marking, in the manner of
// Markdown: blank lines between paragraphs, "## " for a heading, "- " for a
// list, **bold**, *italic*, and [words](address) for a link. Web addresses
// and email addresses written out become links by themselves.
//
// It is never turned into HTML. It is read into the small set of pieces
// below, and the page draws each piece as text or as one fixed element, so
// nothing an owner (or someone with their password) types can become a tag
// or a script. A link goes only to a web address, an email address, or a
// page of this site.

export type Inline =
  | { text: string }
  | { bold: string }
  | { italic: string }
  | { link: string, external: boolean, label: string }

export type Block =
  | { type: 'heading', level: 2 | 3, inline: Inline[] }
  | { type: 'paragraph', lines: Inline[][] }
  | { type: 'list', items: Inline[][] }

export const PAGE_TITLE_MAX = 120
export const PAGE_BODY_MAX = 20_000
export const MAX_PAGES = 50

/** First words of an address that belong to the site itself, so no page may take them. */
export const RESERVED_SLUGS = new Set([
  'admin', 'login', 'setup', 'api', 'album', 'albums', 'photo', 'photos', 'tag', 'tags', 'slideshow', 'embed', 'media', 'brand',
  'search', 'feed', 'sitemap', 'robots', 'favicon', 'skin', 'page', 'pages', 'private', 'index',
])

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

/** The address a link may go to, or null: a web address, an email address, or a path on this site. */
export function safeHref(input: string): { href: string, external: boolean } | null {
  const text = String(input ?? '')
  // eslint-disable-next-line no-control-regex
  if (text === '' || text.length > 500 || /[\u0000- \u007f"'<>`\\]/.test(text)) return null
  if (text.startsWith('/')) return text.startsWith('//') ? null : { href: text, external: false }
  if (/^mailto:/i.test(text)) {
    const address = text.slice('mailto:'.length)
    return EMAIL.test(address) ? { href: `mailto:${address}`, external: false } : null
  }
  if (!/^https?:\/\//i.test(text)) return null
  try {
    const url = new URL(text)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname) return null
    return { href: url.href, external: true }
  }
  catch {
    return null
  }
}

// One pass, left to right: a marked link, bold, italic, a bare web address, a bare email address.
const MARKS = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g

function inline(text: string): Inline[] {
  const pieces: Inline[] = []
  const say = (words: string) => {
    if (words === '') return
    const last = pieces.at(-1)
    if (last && 'text' in last) last.text += words
    else pieces.push({ text: words })
  }
  let at = 0
  for (const found of text.matchAll(MARKS)) {
    say(text.slice(at, found.index))
    at = found.index + found[0].length
    const [whole, label, address, bold, italic, bare, email] = found
    if (label !== undefined && address !== undefined) {
      const to = safeHref(address)
      // An address that is not allowed stays as the words that were typed.
      if (to) pieces.push({ link: to.href, external: to.external, label })
      else say(whole)
    }
    else if (bold !== undefined) pieces.push({ bold })
    else if (italic !== undefined) pieces.push({ italic })
    else if (bare !== undefined) {
      const to = safeHref(bare)
      if (to) pieces.push({ link: to.href, external: true, label: bare })
      else say(whole)
    }
    else if (email !== undefined) pieces.push({ link: `mailto:${email}`, external: false, label: email })
  }
  say(text.slice(at))
  return pieces
}

/** Reads a page's text into the pieces a page is drawn from. */
export function parsePageText(body: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of String(body ?? '').slice(0, PAGE_BODY_MAX).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = chunk.split('\n').map(line => line.trim()).filter(line => line !== '')
    if (lines.length === 0) continue
    const heading = lines.length === 1 ? /^(#{1,3})\s+(.+)$/.exec(lines[0]!) : null
    if (heading) {
      // The page's title is its one first-level heading, so "#" and "##" are both second-level here.
      blocks.push({ type: 'heading', level: heading[1]!.length === 3 ? 3 : 2, inline: inline(heading[2]!) })
    }
    else if (lines.every(line => /^[-*]\s+\S/.test(line))) {
      blocks.push({ type: 'list', items: lines.map(line => inline(line.replace(/^[-*]\s+/, ''))) })
    }
    else {
      blocks.push({ type: 'paragraph', lines: lines.map(inline) })
    }
  }
  return blocks
}

// ── Links the owner adds to the menu ────────────────────────────────

export interface MenuLink { label: string, url: string }
export const MAX_MENU_LINKS = 8
export const MENU_LABEL_MAX = 40

/**
 * Checks the menu links the admin sent. Rows left empty are dropped. Errors
 * are keyed by the row's place in what was sent, or "all".
 */
export function cleanMenuLinks(input: unknown): { links: MenuLink[], errors: Record<string, string> } {
  const links: MenuLink[] = []
  const errors: Record<string, string> = {}
  if (!Array.isArray(input)) return { links, errors }
  input.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) return
    const label = typeof (row as MenuLink).label === 'string' ? (row as MenuLink).label.replace(/\s+/g, ' ').trim() : ''
    const url = typeof (row as MenuLink).url === 'string' ? (row as MenuLink).url.trim() : ''
    if (label === '' && url === '') return
    if (label === '') errors[index] = 'Give this link a label: the word or two shown in the menu.'
    else if (label.length > MENU_LABEL_MAX) errors[index] = `Keep the label to ${MENU_LABEL_MAX} characters.`
    else if (url === '') errors[index] = 'Give this link an address.'
    else {
      const to = safeHref(url)
      if (to) links.push({ label, url: to.href })
      else errors[index] = 'The address must begin https:// or mailto:, or be a page of this site beginning with /'
    }
  })
  if (links.length > MAX_MENU_LINKS) errors.all = `At most ${MAX_MENU_LINKS} links.`
  return { links, errors }
}
