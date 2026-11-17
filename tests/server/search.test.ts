import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Found { query: string, total: number, pages: number, tiles: { slug: string }[] }

describe('searching the photographs', () => {
  let server: TestServer
  let cookie: string
  const ids: Record<string, string> = {}
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const search = async (q: string) => await (await get(server, `/api/search?q=${encodeURIComponent(q)}`)).json() as Found
  const slugs = async (q: string) => (await search(q)).tiles.map(tile => tile.slug).sort()

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    for (const [index, name] of ['harbour', 'tower', 'field', 'secret'].entries()) {
      ids[name] = (await (await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 600, height: 400 }), `${name}.jpg`)).json() as { photo: { id: string } }).photo.id
    }
    await whenProcessed(server, cookie)
    await send('PATCH', `/api/admin/photos/${ids.harbour}`, { title: 'Harbour at dawn', description: 'Fishing boats in the mist.', alt: 'Three boats on still water', tags: ['sea', 'morning'] })
    await send('PATCH', `/api/admin/photos/${ids.tower}`, { title: 'Water tower', description: '100% concrete_and steel', tags: ['night'] })
    await send('PATCH', `/api/admin/photos/${ids.field}`, { title: 'Field', description: 'Wheat near the sea road.' })
    await send('PATCH', `/api/admin/photos/${ids.secret}`, { title: 'Harbour secret', visibility: 'hidden' })
    const coast = (await (await send('POST', '/api/admin/albums', { title: 'Northern Coast' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.field], action: 'add-to-album', album: coast })
    const hidden = (await (await send('POST', '/api/admin/albums', { title: 'Clients Zebra' })).json() as { id: string }).id
    await send('POST', '/api/admin/photos/bulk', { ids: [ids.tower], action: 'add-to-album', album: hidden })
    await send('PATCH', `/api/admin/albums/${hidden}`, { visibility: 'hidden' })
  })
  afterAll(() => server.stop())

  it('finds photos by their title, description, alt text, tags, and the albums they are in', async () => {
    expect(await slugs('harbour')).toEqual(['harbour']) // not the hidden one
    expect(await slugs('MIST')).toEqual(['harbour']) // any case; in the description
    expect(await slugs('boats still')).toEqual(['harbour']) // every word must be found, anywhere
    expect(await slugs('night')).toEqual(['tower']) // a tag
    expect(await slugs('northern')).toEqual(['field']) // an album
    expect(await slugs('sea')).toEqual(['field', 'harbour']) // a tag on one, a description on the other
    expect(await slugs('water')).toEqual(['harbour', 'tower'])
    expect(await search('water tower')).toMatchObject({ query: 'water tower', total: 1, pages: 1 })
  })

  it('never finds what a visitor may not see: hidden photos, photos in the trash, or the names of hidden albums', async () => {
    expect(await slugs('secret')).toEqual([])
    expect(await slugs('zebra')).toEqual([]) // the tower is in a hidden album; its name gives nothing away
    await send('DELETE', `/api/admin/photos/${ids.field}`, undefined)
    expect(await slugs('wheat')).toEqual([])
    await send('POST', `/api/admin/photos/${ids.field}/restore`, undefined)
    await whenProcessed(server, cookie)
    expect(await slugs('wheat')).toEqual(['field'])
  })

  it('takes what is typed as words, not as a pattern or as SQL', async () => {
    expect(await slugs('100%')).toEqual(['tower'])
    expect(await slugs('%')).toEqual(['tower']) // a real percent sign, not "anything"
    expect(await slugs('_')).toEqual(['tower']) // nor "any one character"
    expect(await slugs('concrete_and')).toEqual(['tower'])
    for (const hostile of ['\' or 1=1 --', '" or ""="', '\\', '%\' union select password_hash from users --', 'x'.repeat(5000)]) {
      const response = await get(server, `/api/search?q=${encodeURIComponent(hostile)}`)
      expect(response.status, hostile.slice(0, 20)).toBe(200)
      expect((await response.json() as Found).total, hostile.slice(0, 20)).toBe(0)
    }
    expect((await search('x'.repeat(5000))).query).toHaveLength(100)
  })

  it('finds nothing for an empty search, and is open to other sites like the rest of the public API', async () => {
    expect(await search('')).toMatchObject({ query: '', total: 0, tiles: [] })
    expect(await search('   ')).toMatchObject({ query: '', total: 0 })
    const response = await get(server, '/api/search?q=sea', { origin: 'https://elsewhere.example' }) // as a browser on another site asks
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-fotobogen-api')).toBe('1')
  })

  it('has a page of its own, which works without JavaScript and is not listed by search engines', async () => {
    const html = await (await get(server, '/search?q=harbour')).text()
    expect(html).toMatch(/<form[^>]+action="\/search"[^>]*method="get"|<form[^>]+method="get"[^>]*action="\/search"/)
    expect(html).toMatch(/<input[^>]+name="q"[^>]+value="harbour"|<input[^>]+value="harbour"[^>]+name="q"/)
    expect(html).toContain('/photo/harbour')
    expect(html).not.toContain('/photo/secret')
    expect(html).toMatch(/<meta name="robots" content="noindex/)
    // What was searched for is shown as text.
    const hostile = await (await get(server, `/search?q=${encodeURIComponent('"><script>alert(1)</script>')}`)).text()
    // Nowhere does it close an attribute or a tag and start one of its own.
    expect(hostile).not.toContain('"><script>alert(1)')
    expect(hostile).not.toMatch(/<script>alert\(1\)<\/script>(?![^<]*">)/)
    expect(hostile).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(await (await get(server, '/')).text()).toMatch(/<a href="\/search"[^>]*>Search<\/a>/)
  })
})
