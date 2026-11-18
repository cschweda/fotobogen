// The words a photo arrives with: read from inside the file, or written as
// a start when there are none, so that no photo is ever without alt text.
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer, withEmbeddedText } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

describe('the words a photo arrives with', () => {
  let server: TestServer
  let cookie: string
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { 'content-type': 'application/json', origin: server.url, cookie }, body: JSON.stringify(body) })
  const settings = async () => await (await get(server, '/api/admin/settings', { cookie })).json() as Record<string, unknown>
  const HOSTILE = '"><img src=x onerror=alert(1)>'

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('reads a title, caption, keywords and alt text saved in the file, says so, and shows them to visitors as text', async () => {
    const file = withEmbeddedText(await imageBuffer({ seed: 1, width: 600, height: 400 }), {
      xmp: { title: 'Harbour at dawn', description: `Boats & gulls ${HOSTILE}`, keywords: ['sea', HOSTILE], alt: 'Three fishing boats at a stone quay' },
    })
    const response = await upload(server, cookie, file, 'DSC01234.jpg')
    expect(await response.json()).toMatchObject({ result: 'accepted', photo: { slug: 'harbour-at-dawn' }, fromFile: ['title', 'description', 'alt', 'tags'] })
    await whenProcessed(server, cookie)
    const shown = await (await get(server, '/api/photos/harbour-at-dawn')).json() as { title: string, description: string, alt: string, tags: { name: string }[] }
    expect(shown).toMatchObject({ title: 'Harbour at dawn', description: `Boats & gulls ${HOSTILE}`, alt: 'Three fishing boats at a stone quay' })
    expect(shown.tags.map(tag => tag.name).sort()).toEqual([HOSTILE, 'sea'].sort())
    // On the page, the feed and the slideshow the hostile words are words, not markup.
    for (const path of ['/photo/harbour-at-dawn', '/', '/feed.xml', '/slideshow']) {
      const html = await (await get(server, path)).text()
      // The quote that would end an attribute, or the tag as a tag, never reaches the page as they were typed.
      expect(html.replace(/<script[^>]*type="application\/json"[\s\S]*?<\/script>/g, ''), path).not.toContain('"><img src=x')
      expect(html, path).not.toMatch(/<(p|a|h1|h2|li|span|title)[^>]*><img src=x|\s<img src=x/)
    }
    expect(await (await get(server, '/photo/harbour-at-dawn')).text()).toContain('&lt;img src=x')
  })

  it('is switched off under Settings, by the owner', async () => {
    expect((await settings()).readWords).toBe(true)
    const all = await settings()
    expect((await send('PUT', '/api/admin/settings', { ...all, readWords: 'no' })).status).toBe(422)
    expect((await send('PUT', '/api/admin/settings', { ...all, readWords: false })).status).toBe(200)
    expect((await settings()).readWords).toBe(false)

    const file = withEmbeddedText(await imageBuffer({ seed: 2, width: 600, height: 400 }), { xmp: { title: 'Private note', keywords: ['client-name'] }, iptc: { caption: 'Do not publish' } })
    expect(await (await upload(server, cookie, file, 'evening walk.jpg')).json()).toMatchObject({ photo: { slug: 'evening-walk' }, fromFile: [] })
    await whenProcessed(server, cookie)
    expect(query(server, `select title, description, alt, alt_auto from photos where slug = 'evening-walk'`)).toEqual([{ title: null, description: null, alt: 'Evening walk', alt_auto: 1 }])
    expect(JSON.stringify(await (await get(server, '/api/photos/evening-walk')).json())).not.toMatch(/Private note|client-name|Do not publish/)
    // A program that saves the settings without knowing of the switch leaves it as it was.
    const { readWords: _left, ...older } = await settings()
    expect((await send('PUT', '/api/admin/settings', older)).status).toBe(200)
    expect((await settings()).readWords).toBe(false)
  })

  it('never lets a photo go without alt text, and feeds read it out with the picture', async () => {
    const id = query<{ id: string }>(server, `select id from photos where slug = 'evening-walk'`)[0]!.id
    for (const empty of ['', '  ', null]) {
      const refused = await send('PATCH', `/api/admin/photos/${id}`, { alt: empty })
      expect(refused.status).toBe(422)
      expect(await refused.json()).toMatchObject({ errors: { alt: 'Describe the photo in a few words, for people who cannot see it.' } })
    }
    expect((await (await get(server, `/api/admin/photos/${id}`, { cookie })).json() as { altToCheck: boolean }).altToCheck).toBe(true)
    expect((await send('PATCH', `/api/admin/photos/${id}`, { altChecked: true })).status).toBe(200)
    expect((await (await get(server, `/api/admin/photos/${id}`, { cookie })).json() as { altToCheck: boolean }).altToCheck).toBe(false)
    // The picture in a feed entry is HTML carried inside XML, so its quotes are escaped once more.
    const feed = (await (await get(server, '/feed.xml')).text()).replaceAll('&amp;quot;', '"').replaceAll('&quot;', '"')
    expect(feed).toContain('alt="Evening walk"')
    expect(feed).toContain('alt="Three fishing boats at a stone quay"')
    expect(feed).not.toContain('alt=""')
  })

  it('gives a first alt text to photos from before, when the server starts', async () => {
    await server.stop()
    const db = new Database(join(server.dataDir, 'fotobogen.db'))
    db.prepare(`update photos set alt = null, alt_auto = 0 where slug = 'evening-walk'`).run()
    db.prepare(`update photos set alt = '  ', alt_auto = 0 where slug = 'harbour-at-dawn'`).run()
    db.close()
    await server.restart()
    expect(query(server, `select slug, alt, alt_auto from photos order by slug`)).toEqual([
      { slug: 'evening-walk', alt: 'Evening walk', alt_auto: 1 },
      { slug: 'harbour-at-dawn', alt: 'Harbour at dawn', alt_auto: 1 },
    ])
    expect(server.output()).toContain('Wrote a first alt text for 2 photos')
  })
})
