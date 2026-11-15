import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanSeo, pageTitle, SEO_DEFAULTS, TITLE_PATTERNS } from '../../shared/seo.ts'
import { cleanLanguage, cleanText, SITE_TEXT, siteText, TEXT_KEYS, UNNAMED_SITE } from '../../shared/site-text.ts'

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? sources(path) : /\.(vue|ts)$/.test(name) ? [path] : []
})

describe('the site\'s own words', () => {
  it('keeps only known pieces of text, as plain single lines of a sensible length', () => {
    expect(cleanText({ navPhotos: '  Bilder  ', notAKey: 'x', navAlbums: 42, gridMore: 'Mehr\nBilder\u0000' })).toEqual({ navPhotos: 'Bilder', gridMore: 'Mehr Bilder' })
    expect(cleanText({ footerNote: 'x'.repeat(500) }).footerNote).toHaveLength(200)
    expect(cleanText('nonsense')).toEqual({})
    expect(cleanText(null)).toEqual({})
  })
  it('drops wording that is empty or the same as the default, so the default is used', () => {
    expect(cleanText({ navPhotos: 'Photos', navAlbums: '', navSlideshow: '   ' })).toEqual({})
    // The footer line has no default, so anything written there is kept.
    expect(cleanText({ footerNote: '© 2026 Ana Lima' })).toEqual({ footerNote: '© 2026 Ana Lima' })
  })
  it('uses the owner\'s wording where there is one and the default elsewhere, filling in the named parts', () => {
    expect(siteText({ navPhotos: 'Bilder' }, 'navPhotos')).toBe('Bilder')
    expect(siteText({}, 'navPhotos')).toBe('Photos')
    expect(siteText(undefined, 'tagged', { count: 3, photos: 'photos', tag: 'night' })).toBe('3 photos tagged “night”.')
    expect(siteText({ tagged: '{tag}: {count}' }, 'tagged', { count: 1, photos: 'photo', tag: 'sea' })).toBe('sea: 1')
    // A name with nothing to fill it is left as written, not blanked.
    expect(siteText({ tagged: '{tag} {nope}' }, 'tagged', { tag: 'sea' })).toBe('sea {nope}')
  })
  it('never falls back to the software\'s name', () => {
    expect(UNNAMED_SITE).toBe('Photographs')
    for (const key of TEXT_KEYS) expect(SITE_TEXT[key].default, key).not.toMatch(/fotobogen/i)
  })
  it('has a label for every piece of text, and every piece is used on a page', () => {
    const code = [...sources('app'), ...sources('server/routes')].map(path => readFileSync(path, 'utf8')).join('\n')
    for (const key of TEXT_KEYS) {
      expect(SITE_TEXT[key].label.length, key).toBeGreaterThan(5)
      expect(code.includes(`'${key}'`), `"${key}" is not used anywhere`).toBe(true)
    }
  })
  it('accepts a language code and nothing else', () => {
    expect(['en', 'de', 'pt-BR', 'zh-Hant-TW'].map(cleanLanguage)).toEqual(['en', 'de', 'pt-BR', 'zh-Hant-TW'])
    expect(['English', '"><script>', '', 7].map(cleanLanguage)).toEqual(['en', 'en', 'en', 'en'])
  })
})

describe('search and sharing settings', () => {
  it('start with everything left to the site\'s title, tagline, and newest photo, and listed in search', () => {
    expect(cleanSeo({})).toEqual({ settings: SEO_DEFAULTS, errors: {} })
    expect(SEO_DEFAULTS).toMatchObject({ homeTitle: '', description: '', cardPhoto: '', indexing: true, siteUrl: '' })
  })
  it('write a page\'s title in the chosen way', () => {
    expect(TITLE_PATTERNS.map(titlePattern => pageTitle({ homeTitle: '', titlePattern }, 'Ana Lima', 'Harbour'))).toEqual([
      'Harbour | Ana Lima', 'Harbour – Ana Lima', 'Harbour · Ana Lima', 'Ana Lima: Harbour', 'Harbour',
    ])
    // The home page is the site's title, or its own if one was given.
    expect(pageTitle({ homeTitle: '', titlePattern: '{page} | {site}' }, 'Ana Lima')).toBe('Ana Lima')
    expect(pageTitle({ homeTitle: 'Ana Lima, photographer in Porto', titlePattern: '{page}' }, 'Ana Lima')).toBe('Ana Lima, photographer in Porto')
    // A title containing the pattern's own markers is not expanded twice.
    expect(pageTitle({ homeTitle: '', titlePattern: '{page} | {site}' }, 'S', '{site} $& $1')).toBe('{site} $& $1 | S')
  })
  it('keep what is valid and say what is wrong with the rest', () => {
    const good = cleanSeo({ homeTitle: ' Home ', description: 'Street\nphotographs', cardPhoto: 'harbour-2', indexing: false, siteUrl: 'https://photos.example.com/some/page?x=1', author: 'Ana', twitter: '@ana_lima', googleVerification: 'abc-DEF_123', bingVerification: 'A1B2', titlePattern: '{page}' })
    expect(good.errors).toEqual({})
    expect(good.settings).toEqual({ homeTitle: 'Home', description: 'Street photographs', cardPhoto: 'harbour-2', indexing: false, siteUrl: 'https://photos.example.com', author: 'Ana', twitter: 'ana_lima', googleVerification: 'abc-DEF_123', bingVerification: 'A1B2', titlePattern: '{page}' })

    const bad = cleanSeo({ siteUrl: 'javascript:alert(1)', twitter: 'not a handle!', googleVerification: '"><script>', cardPhoto: '../etc', titlePattern: '<b>{page}</b>' })
    expect(Object.keys(bad.errors).sort()).toEqual(['cardPhoto', 'googleVerification', 'siteUrl', 'titlePattern', 'twitter'])
    expect(bad.settings).toMatchObject({ siteUrl: '', twitter: '', googleVerification: '', cardPhoto: '', titlePattern: '{page} | {site}' })
    expect(cleanSeo({ siteUrl: 'photos.example.com' }).errors.siteUrl).toMatch(/in full/)
    expect(cleanSeo({ cardPhoto: 'none' }).settings.cardPhoto).toBe('none')
  })
})
