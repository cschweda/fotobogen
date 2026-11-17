import { describe, expect, it } from 'vitest'
import { cleanEmbedSize, embedAddress, embedCode, EMBED_SIZE } from '../../shared/embed.ts'

describe('the code to paste into another site', () => {
  it('points at the slideshow for every photo, one album, or one tag', () => {
    expect(embedAddress('https://photos.example.com', { kind: 'all' })).toBe('https://photos.example.com/embed/slideshow')
    expect(embedAddress('https://photos.example.com/', { kind: 'album', slug: 'road-trip' })).toBe('https://photos.example.com/embed/slideshow?album=road-trip')
    expect(embedAddress('https://photos.example.com', { kind: 'tag', slug: 'night & day' })).toBe('https://photos.example.com/embed/slideshow?tag=night%20%26%20day')
  })

  it('is one iframe that keeps its shape and never runs wider than the page it is in', () => {
    expect(embedCode({ origin: 'https://photos.example.com', source: { kind: 'all' }, width: 800, height: 600, siteTitle: 'Kodachrome Days' })).toBe(
      '<iframe src="https://photos.example.com/embed/slideshow" width="800" height="600" style="border:0;max-width:100%;height:auto;aspect-ratio:800/600" title="Slideshow: Kodachrome Days" loading="lazy"></iframe>',
    )
  })

  it('cannot be broken out of by a site title or an album name', () => {
    const code = embedCode({ origin: 'https://photos.example.com', source: { kind: 'tag', slug: '"><script>' }, width: 800, height: 600, siteTitle: 'Tom\'s "best" <b>' })
    expect(code).toContain('title="Slideshow: Tom\'s &quot;best&quot; &lt;b&gt;"')
    expect(code).toContain('?tag=%22%3E%3Cscript%3E"')
    expect(code.match(/</g)).toHaveLength(2)
    expect(embedCode({ origin: 'https://photos.example.com', source: { kind: 'all' }, width: 800, height: 600, siteTitle: '' })).toContain('title="Slideshow"')
  })

  it('keeps the size to whole numbers a page can use', () => {
    expect(cleanEmbedSize(640.4, 'width')).toBe(640)
    expect(cleanEmbedSize(3, 'width')).toBe(EMBED_SIZE.width.min)
    expect(cleanEmbedSize(99999, 'height')).toBe(EMBED_SIZE.height.max)
    expect(cleanEmbedSize(Number.NaN, 'height')).toBe(EMBED_SIZE.height.initial)
    expect(cleanEmbedSize('abc', 'width')).toBe(EMBED_SIZE.width.initial)
  })
})
