import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Page { id: string, slug: string, title: string, body: string, visibility: string, inMenu: boolean }

describe('pages and menu links', () => {
  let server: TestServer
  let cookie: string
  const send = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => fetch(server.url + path, {
    method, headers: headers ?? { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const pages = async () => (await (await get(server, '/api/admin/pages', { cookie })).json() as { pages: Page[] }).pages
  const menu = async () => (await (await get(server, '/api/site')).json() as { menu: { label: string, href: string, external: boolean }[] }).menu
  const make = async (body: Record<string, unknown>) => {
    const response = await send('POST', '/api/admin/pages', body)
    return { status: response.status, ...(await response.json() as { id?: string, slug?: string, errors?: Record<string, string> }) }
  }

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('starts with no pages and nothing added to the menu', async () => {
    expect(await pages()).toEqual([])
    expect(await menu()).toEqual([])
    expect((await get(server, '/about')).status).toBe(404)
  })

  it('makes a page at an address of its own, shown to visitors and listed in the menu', async () => {
    const made = await make({ title: 'About', body: 'I take photographs.\n\nWrite to me@example.com.' })
    expect(made).toMatchObject({ status: 201, slug: 'about' })
    expect(await (await get(server, '/api/pages/about')).json()).toEqual({ slug: 'about', title: 'About', body: 'I take photographs.\n\nWrite to me@example.com.' })
    const html = await (await get(server, '/about')).text()
    expect(html).toContain('<h1 class="fb-page-title">About</h1>')
    expect(html).toContain('<p>I take photographs.</p>')
    expect(html).toContain('<a href="mailto:me@example.com">me@example.com</a>')
    expect(await menu()).toEqual([{ label: 'About', href: '/about', external: false }])
    expect(html).toMatch(/<nav class="fb-nav"[^>]*>.*<a href="\/about"[^>]*>About<\/a>/s)
    expect(await (await get(server, '/sitemap.xml')).text()).toContain(`${server.url}/about</loc>`)
  })

  it('keeps markup typed into a page as text, and makes links only to safe addresses', async () => {
    await make({ title: 'Hostile', body: '<script>alert(1)</script> <img src=x onerror=alert(2)>\n\n[click](javascript:alert(3)) and [fine](https://example.com/x)', inMenu: false })
    const html = await (await get(server, '/hostile')).text()
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toMatch(/href="javascript:/i)
    expect(html).toContain('<a href="https://example.com/x" rel="noopener">fine</a>')
  })

  it('refuses a title or address it cannot use, and addresses the site itself needs', async () => {
    expect(await make({ title: '' })).toMatchObject({ status: 422, errors: { title: expect.any(String) } })
    expect(await make({ title: 'x'.repeat(200) })).toMatchObject({ status: 422, errors: { title: expect.any(String) } })
    expect(await make({ title: 'Body', body: 'x'.repeat(20_001) })).toMatchObject({ status: 422, errors: { body: expect.any(String) } })
    for (const slug of ['admin', 'api', 'albums', 'photo', 'login', 'slideshow', 'embed', 'search']) {
      expect(await make({ title: 'Taken', slug }), slug).toMatchObject({ status: 422, errors: { slug: expect.stringContaining('used by the site') } })
    }
    // A title that would give a reserved address gets another; a title already used gets a number.
    expect(await make({ title: 'Albums', inMenu: false })).toMatchObject({ status: 201, slug: 'albums-page' })
    expect(await make({ title: 'About', inMenu: false })).toMatchObject({ status: 201, slug: 'about-2' })
    expect((await get(server, '/albums')).status).toBe(200) // still the site's own albums page
  })

  it('edits a page: its words, its address, whether it is public, and whether it is in the menu', async () => {
    const about = (await pages()).find(page => page.slug === 'about')!
    expect((await send('PATCH', `/api/admin/pages/${about.id}`, { title: 'About me', slug: 'me', body: '## Hello' })).status).toBe(200)
    expect((await get(server, '/about')).status).toBe(404)
    expect(await (await get(server, '/me')).text()).toContain('<h2>Hello</h2>')
    expect(await menu()).toEqual([{ label: 'About me', href: '/me', external: false }])
    // Another page's address is refused; so is one the site needs.
    expect((await send('PATCH', `/api/admin/pages/${about.id}`, { slug: 'hostile' })).status).toBe(409)
    expect((await send('PATCH', `/api/admin/pages/${about.id}`, { slug: 'admin' })).status).toBe(422)

    // Hidden: gone for visitors, from the menu, and from the sitemap; still in the admin.
    expect((await send('PATCH', `/api/admin/pages/${about.id}`, { visibility: 'hidden' })).status).toBe(200)
    expect((await get(server, '/me')).status).toBe(404)
    expect((await get(server, '/api/pages/me')).status).toBe(404)
    expect(await menu()).toEqual([])
    expect(await (await get(server, '/sitemap.xml')).text()).not.toContain('/me</loc>')
    expect((await pages()).find(page => page.id === about.id)).toMatchObject({ visibility: 'hidden', title: 'About me' })
    // Public but out of the menu: reachable, not listed.
    expect((await send('PATCH', `/api/admin/pages/${about.id}`, { visibility: 'public', inMenu: false })).status).toBe(200)
    expect((await get(server, '/me')).status).toBe(200)
    expect(await menu()).toEqual([])
    expect((await send('PATCH', '/api/admin/pages/nothing', { title: 'x' })).status).toBe(404)
  })

  it('puts the owner\'s own links in the menu after the pages, in the order given', async () => {
    const about = (await pages()).find(page => page.slug === 'me')!
    await send('PATCH', `/api/admin/pages/${about.id}`, { inMenu: true })
    const saved = await send('PUT', '/api/admin/menu', { links: [{ label: 'Shop', url: 'https://shop.example.com' }, { label: '', url: '' }, { label: 'Email', url: 'mailto:me@example.com' }] })
    expect(saved.status).toBe(200)
    expect(await menu()).toEqual([
      { label: 'About me', href: '/me', external: false },
      { label: 'Shop', href: 'https://shop.example.com/', external: true },
      { label: 'Email', href: 'mailto:me@example.com', external: false },
    ])
    const html = await (await get(server, '/')).text()
    expect(html).toContain('<a href="https://shop.example.com/" rel="noopener">Shop</a>')
    // A link that could run script is refused, and what was saved stays.
    const bad = await send('PUT', '/api/admin/menu', { links: [{ label: 'Bad', url: 'javascript:alert(1)' }] })
    expect(bad.status).toBe(422)
    expect(await (await get(server, '/api/admin/menu', { cookie })).json()).toMatchObject({ links: [{ label: 'Shop' }, { label: 'Email' }] })
  })

  it('changes the order of pages in the menu', async () => {
    await make({ title: 'Contact' })
    expect((await menu()).map(link => link.label)).toEqual(['About me', 'Contact', 'Shop', 'Email'])
    const contact = (await pages()).find(page => page.slug === 'contact')!
    // One press moves it one place up the list of all pages, past those that are not in the menu too.
    expect((await pages()).map(page => page.slug)).toEqual(['me', 'hostile', 'albums-page', 'about-2', 'contact'])
    expect((await send('POST', `/api/admin/pages/${contact.id}/move`, { to: 'up' })).status).toBe(200)
    expect((await pages()).map(page => page.slug)).toEqual(['me', 'hostile', 'albums-page', 'contact', 'about-2'])
    for (let press = 0; press < 5; press++) await send('POST', `/api/admin/pages/${contact.id}/move`, { to: 'up' }) // more than enough: it stops at the top
    expect((await pages())[0]!.slug).toBe('contact')
    expect((await menu()).map(link => link.label).slice(0, 2)).toEqual(['Contact', 'About me'])
    expect((await send('POST', `/api/admin/pages/${contact.id}/move`, { to: 'sideways' })).status).toBe(422)
    expect((await send('POST', '/api/admin/pages/nothing/move', { to: 'up' })).status).toBe(404)
  })

  it('is for the logged-in owner only: no token, no other site, no visitor', async () => {
    const { token } = await (await send('POST', '/api/admin/tokens', { name: 't', scope: 'manage' })).json() as { token: string }
    const bearer = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    expect((await send('POST', '/api/admin/pages', { title: 'By token' }, bearer)).status).toBe(403)
    expect((await send('PUT', '/api/admin/menu', { links: [] }, bearer)).status).toBe(403)
    expect((await send('GET', '/api/admin/pages', undefined, bearer)).status).toBe(403)
    expect((await send('POST', '/api/admin/pages', { title: 'No login' }, { 'origin': server.url, 'content-type': 'application/json' })).status).toBe(401)
    expect((await send('POST', '/api/admin/pages', { title: 'Elsewhere' }, { 'origin': 'http://evil.example', cookie, 'content-type': 'application/json' })).status).toBe(403)
    expect((await get(server, '/api/admin/pages')).status).toBe(401)
  })

  it('deletes a page', async () => {
    const hostile = (await pages()).find(page => page.slug === 'hostile')!
    expect((await send('DELETE', `/api/admin/pages/${hostile.id}`)).status).toBe(200)
    expect((await get(server, '/hostile')).status).toBe(404)
    expect((await send('DELETE', `/api/admin/pages/${hostile.id}`)).status).toBe(404)
  })
})
