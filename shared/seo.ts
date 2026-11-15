// What search engines and social networks are told about the site.
// Set under Admin, Search and sharing.

/** How a page's name and the site's name are joined in the browser tab and in search results. */
export const TITLE_PATTERNS = ['{page} | {site}', '{page} – {site}', '{page} · {site}', '{site}: {page}', '{page}'] as const
export type TitlePattern = typeof TITLE_PATTERNS[number]

export interface SeoSettings {
  /** The home page's title. Empty: the site's title. */
  homeTitle: string
  titlePattern: TitlePattern
  /** A sentence or two about the site. Empty: the tagline. */
  description: string
  /** The photo shown when the site is shared: a photo's web address name, '' for the newest photo, or 'none'. */
  cardPhoto: string
  /** False asks search engines not to list the site. */
  indexing: boolean
  /** The site's proper address, such as https://photos.example.com. Empty: whatever address the visitor used. */
  siteUrl: string
  /** The photographer's name, for the "author" tag. */
  author: string
  /** A username on X (Twitter), without the @, credited when a page is shared there. */
  twitter: string
  /** Codes that prove to Google and Bing that the site is yours. */
  googleVerification: string
  bingVerification: string
}

export const SEO_DEFAULTS: SeoSettings = {
  homeTitle: '', titlePattern: '{page} | {site}', description: '', cardPhoto: '', indexing: true,
  siteUrl: '', author: '', twitter: '', googleVerification: '', bingVerification: '',
}

const line = (given: unknown, max: number): string => typeof given === 'string' ? given.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : ''

/** Checks what the admin sent. Returns the settings, or which fields are wrong and why. */
export function cleanSeo(given: unknown): { settings: SeoSettings, errors: Record<string, string> } {
  const input = typeof given === 'object' && given !== null ? given as Record<string, unknown> : {}
  const errors: Record<string, string> = {}
  const settings: SeoSettings = { ...SEO_DEFAULTS }

  settings.homeTitle = line(input.homeTitle, 120)
  settings.description = line(input.description, 300)
  settings.author = line(input.author, 80)
  settings.indexing = input.indexing !== false
  if (TITLE_PATTERNS.includes(input.titlePattern as TitlePattern)) settings.titlePattern = input.titlePattern as TitlePattern
  else if (input.titlePattern !== undefined) errors.titlePattern = 'Choose one of the listed ways to write a page title.'

  const card = line(input.cardPhoto, 120)
  if (card === '' || card === 'none' || /^[a-z0-9-]+$/.test(card)) settings.cardPhoto = card
  else errors.cardPhoto = 'Choose a photo from the list.'

  const address = line(input.siteUrl, 200)
  if (address) {
    let url: URL | undefined
    try { url = new URL(address) }
    catch { /* reported below */ }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) errors.siteUrl = 'Write the address in full, like https://photos.example.com'
    // Only the address of the site itself: no page, no question mark.
    else settings.siteUrl = url.origin
  }

  const twitter = line(input.twitter, 40).replace(/^@/, '')
  if (twitter === '' || /^[A-Za-z0-9_]{1,15}$/.test(twitter)) settings.twitter = twitter
  else errors.twitter = 'A username is up to 15 letters, digits, and underscores.'

  for (const field of ['googleVerification', 'bingVerification'] as const) {
    const code = line(input[field], 120)
    if (code === '' || /^[A-Za-z0-9_-]{1,100}$/.test(code)) settings[field] = code
    else errors[field] = 'Paste only the code itself: letters, digits, hyphens, and underscores.'
  }
  return { settings, errors }
}

/** The title of a page as the browser tab and search engines get it. */
export function pageTitle(seo: Pick<SeoSettings, 'homeTitle' | 'titlePattern'>, siteTitle: string, page?: string | null): string {
  if (!page) return seo.homeTitle || siteTitle
  // In one pass, so a page called "{site}" is not expanded a second time.
  return seo.titlePattern.replace(/\{(page|site)\}/g, (_, name: string) => name === 'page' ? page : siteTitle)
}
