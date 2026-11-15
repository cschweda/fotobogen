// URL slugs for photos: lowercase ASCII words joined by hyphens.

const MAX_LENGTH = 80

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents left behind by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '')
}

/**
 * The wanted slug, or the same with -2, -3, ... when it is taken.
 * A photo with nothing usable to name it by gets `photo-<id>`.
 */
export function uniqueSlug(wanted: string, id: string, isTaken: (slug: string) => boolean): string {
  const base = wanted || `photo-${slugify(id)}`
  if (!isTaken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!isTaken(candidate)) return candidate
  }
}
