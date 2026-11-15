import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from '../../server/pipeline/slug.ts'

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Morning at the Lake')).toBe('morning-at-the-lake')
  })
  it('drops accents and punctuation', () => {
    expect(slugify('Café  “Zürich”, 2024!')).toBe('cafe-zurich-2024')
  })
  it('turns camera file names into something readable', () => {
    expect(slugify('IMG_0042')).toBe('img-0042')
  })
  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('写真')).toBe('')
    expect(slugify('---')).toBe('')
  })
  it('keeps slugs to 80 characters without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(79) + ' b c')
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('uses the wanted slug when it is free', () => {
    expect(uniqueSlug('lake', 'abc', () => false)).toBe('lake')
  })
  it('adds a number when the slug is taken', () => {
    const taken = new Set(['lake', 'lake-2'])
    expect(uniqueSlug('lake', 'abc', slug => taken.has(slug))).toBe('lake-3')
  })
  it('falls back to the id when there is no usable slug', () => {
    expect(uniqueSlug('', 'Ab3_x-9', () => false)).toBe('photo-ab3-x-9')
  })
})
