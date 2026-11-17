import { describe, expect, it } from 'vitest'
import { cleanMenuLinks, MAX_MENU_LINKS, parsePageText, RESERVED_SLUGS, safeHref } from '../../shared/page-text.ts'

describe('the text of a page', () => {
  it('is paragraphs, headings, and lists, written as plain text', () => {
    expect(parsePageText('About me\nand my camera.\n\n## Prints\n\n- Small\n- Large\n\n### Sizes\n\nLast words.')).toEqual([
      { type: 'paragraph', lines: [[{ text: 'About me' }], [{ text: 'and my camera.' }]] },
      { type: 'heading', level: 2, inline: [{ text: 'Prints' }] },
      { type: 'list', items: [[{ text: 'Small' }], [{ text: 'Large' }]] },
      { type: 'heading', level: 3, inline: [{ text: 'Sizes' }] },
      { type: 'paragraph', lines: [[{ text: 'Last words.' }]] },
    ])
    expect(parsePageText('')).toEqual([])
    expect(parsePageText('  \n\n \r\n')).toEqual([])
    // Windows line endings, and a single # (the page's title is the only first-level heading).
    expect(parsePageText('# Top\r\n\r\nText')).toEqual([{ type: 'heading', level: 2, inline: [{ text: 'Top' }] }, { type: 'paragraph', lines: [[{ text: 'Text' }]] }])
  })

  it('marks bold, italic, and links, and turns bare addresses and email addresses into links', () => {
    const [block] = parsePageText('Write to me@example.com or see **prints** and *sizes* at [the shop](https://shop.example.com/prints), https://example.com/a. Also [albums](/albums).')
    expect(block).toEqual({ type: 'paragraph', lines: [[
      { text: 'Write to ' }, { link: 'mailto:me@example.com', external: false, label: 'me@example.com' },
      { text: ' or see ' }, { bold: 'prints' }, { text: ' and ' }, { italic: 'sizes' }, { text: ' at ' },
      { link: 'https://shop.example.com/prints', external: true, label: 'the shop' }, { text: ', ' },
      { link: 'https://example.com/a', external: true, label: 'https://example.com/a' }, { text: '. Also ' },
      { link: '/albums', external: false, label: 'albums' }, { text: '.' },
    ]] })
  })

  it('never makes a link out of anything but a web address, an email address, or a page of this site', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', '//evil.example/x', '/\\evil.example', 'ftp://example.com', 'https://', 'http://exa mple.com', 'mailto:not an address', 'mailto:a@b.co?subject=x%0Abcc:c@d.co', '', 'about', 'https://user:pass@example.com/']) {
      expect(safeHref(bad), bad).toBeNull()
    }
    expect(safeHref('https://example.com/a?b=c#d')).toEqual({ href: 'https://example.com/a?b=c#d', external: true })
    expect(safeHref('/photo/crossing')).toEqual({ href: '/photo/crossing', external: false })
    expect(safeHref('mailto:me@example.com')).toEqual({ href: 'mailto:me@example.com', external: false })
    // A link that is not allowed stays as the words that were typed.
    expect(parsePageText('[click](javascript:alert(1))')).toEqual([{ type: 'paragraph', lines: [[{ text: '[click](javascript:alert(1))' }]] }])
  })

  it('keeps markup as text: nothing typed becomes a tag', () => {
    const text = '<script>alert(1)</script> <img src=x onerror=alert(2)> **<b>x</b>**'
    const [block] = parsePageText(text)
    expect(JSON.stringify(block)).toContain('<script>alert(1)</script>')
    expect(block).toMatchObject({ type: 'paragraph' })
    // Only these kinds of piece exist; each is rendered as text or as one fixed element.
    for (const piece of (block as { lines: Record<string, unknown>[][] }).lines.flat()) expect(Object.keys(piece).some(key => ['text', 'bold', 'italic', 'link'].includes(key))).toBe(true)
  })

  it('reads the longest page a site can hold quickly, whatever it is made of', () => {
    // Found by the third audit, of 17 November 2026: text with no spaces took a third of a second to read, on every view.
    const awkward = ['a'.repeat(20_000), 'a.'.repeat(9_999) + '@', `https://${'.'.repeat(19_990)}`, 'a@'.repeat(10_000), '['.repeat(20_000), '*'.repeat(20_000), '[a]('.repeat(5_000), 'a-'.repeat(9_990) + '@b.co']
    for (const text of awkward) {
      const start = performance.now()
      parsePageText(text)
      expect(performance.now() - start, text.slice(0, 12)).toBeLessThan(50)
    }
    // And still finds an address at the end of a long run of words.
    expect(JSON.stringify(parsePageText(`${'word '.repeat(3000)}me@example.com`))).toContain('mailto:me@example.com')
    expect(JSON.stringify(parsePageText('(me@example.com)'))).toContain('mailto:me@example.com')
  })

  it('reserves the addresses the site itself uses', () => {
    for (const name of ['admin', 'login', 'setup', 'api', 'album', 'albums', 'photo', 'tag', 'slideshow', 'embed', 'media', 'brand', 'search', 'feed', 'sitemap']) expect(RESERVED_SLUGS.has(name), name).toBe(true)
    expect(RESERVED_SLUGS.has('about')).toBe(false)
  })
})

describe('menu links', () => {
  it('are a label and a safe address each, a few at most', () => {
    expect(cleanMenuLinks([{ label: ' Shop ', url: 'https://shop.example.com' }, { label: 'Email', url: 'mailto:me@example.com' }, { label: 'Albums', url: '/albums' }])).toEqual({
      links: [{ label: 'Shop', url: 'https://shop.example.com/' }, { label: 'Email', url: 'mailto:me@example.com' }, { label: 'Albums', url: '/albums' }], errors: {},
    })
    // Empty rows are dropped; a row with only one half is an error at that row.
    expect(cleanMenuLinks([{ label: '', url: '' }, { label: 'Shop', url: '' }, { label: '', url: 'https://x.example' }]).errors).toEqual({ 1: expect.stringContaining('address'), 2: expect.stringContaining('label') })
    expect(cleanMenuLinks([{ label: 'Bad', url: 'javascript:alert(1)' }]).errors).toHaveProperty('0')
    expect(cleanMenuLinks([{ label: 'x'.repeat(60), url: '/a' }]).errors).toHaveProperty('0')
    expect(cleanMenuLinks(Array.from({ length: MAX_MENU_LINKS + 1 }, (_, n) => ({ label: `L${n}`, url: '/a' }))).errors).toHaveProperty('all')
    expect(cleanMenuLinks('nonsense')).toEqual({ links: [], errors: {} })
    expect(cleanMenuLinks([null, 3, 'x'])).toEqual({ links: [], errors: {} })
  })
})
