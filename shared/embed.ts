// The slideshow for other sites: the code an owner pastes into another
// site's page to show it there. Plain TypeScript, used by the admin page.

export type EmbedSource = { kind: 'all' } | { kind: 'album', slug: string } | { kind: 'tag', slug: string }

/** The sizes the admin offers, in pixels. The frame shrinks to fit a narrower page whatever is chosen. */
export const EMBED_SIZE = {
  width: { min: 240, max: 4000, initial: 800 },
  height: { min: 200, max: 4000, initial: 600 },
} as const

export function cleanEmbedSize(value: unknown, side: keyof typeof EMBED_SIZE): number {
  const { min, max, initial } = EMBED_SIZE[side]
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : initial
}

/** The address of the slideshow, on the public site at `origin`. */
export function embedAddress(origin: string, source: EmbedSource): string {
  const base = `${origin.replace(/\/+$/, '')}/embed/slideshow`
  return source.kind === 'all' ? base : `${base}?${source.kind}=${encodeURIComponent(source.slug)}`
}

const escapeAttribute = (value: string): string =>
  value.replace(/[&"<>]/g, character => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!)

/**
 * The iframe, as HTML. It keeps the chosen shape and shrinks with a narrow
 * page: the width and height are a starting size, not a fixed one.
 */
export function embedCode(options: { origin: string, source: EmbedSource, width: number, height: number, siteTitle: string }): string {
  const width = cleanEmbedSize(options.width, 'width')
  const height = cleanEmbedSize(options.height, 'height')
  const title = options.siteTitle.trim() ? `Slideshow: ${options.siteTitle.trim()}` : 'Slideshow'
  return `<iframe src="${escapeAttribute(embedAddress(options.origin, options.source))}" width="${width}" height="${height}" `
    + `style="border:0;max-width:100%;height:auto;aspect-ratio:${width}/${height}" title="${escapeAttribute(title)}" loading="lazy"></iframe>`
}
