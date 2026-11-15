// The site's icon and logo: uploaded in the admin, checked, redrawn, and
// shown on the public site.
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

describe('the site\'s icon and logo', () => {
  let server: TestServer
  let cookie: string
  const put = (kind: string, body: Uint8Array | string, headers: Record<string, string> = {}) => fetch(`${server.url}/api/admin/brand/${kind}`, {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'image/png', ...headers }, body: body as BodyInit,
  })
  const remove = (kind: string) => fetch(`${server.url}/api/admin/brand/${kind}`, { method: 'DELETE', headers: { origin: server.url, cookie } })
  const home = async () => await (await get(server, '/', { accept: 'text/html' })).text()
  const picture = async (address: string) => sharp(Buffer.from(await (await fetch(server.url + address)).arrayBuffer())).metadata()
  const message = async (response: Response) => (await response.json() as { message: string }).message

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
  })
  afterAll(async () => { await server.stop() })

  it('starts with neither: the name is text, and no page carries the software\'s mark', async () => {
    const html = await home()
    expect(html).toContain('>Test Photos</a>')
    expect(html).not.toContain('fb-site-logo')
    expect(html).not.toMatch(/<link[^>]*rel="icon"/)
    expect((await get(server, '/favicon.ico')).status).toBe(204)
    expect((await get(server, '/brand/icon-32.png')).status).toBe(404)
    // The admin keeps Fotobogen's own mark.
    expect(await (await get(server, '/login', { accept: 'text/html' })).text()).toMatch(/<link[^>]*rel="icon"[^>]*data:image\/svg/)
  })

  it('makes an icon in each size from one upload, and puts it on every public page', async () => {
    const response = await put('icon', await imageBuffer({ width: 800, height: 600, format: 'png', seed: 3 }))
    expect(response.status).toBe(200)
    const { shown } = await response.json() as { shown: { icon: { small: string, touch: string, large: string } } }
    // Cropped square, whatever shape was uploaded.
    expect(await picture(shown.icon.small)).toMatchObject({ format: 'png', width: 32, height: 32 })
    expect(await picture(shown.icon.touch)).toMatchObject({ format: 'png', width: 180, height: 180 })
    expect(await picture(shown.icon.large)).toMatchObject({ format: 'png', width: 192, height: 192 })

    const html = await home()
    expect(html).toMatch(/<link[^>]*rel="icon"[^>]*sizes="32x32"[^>]*href="\/brand\/icon-32\.png\?v=[0-9a-f]{10}"/)
    expect(html).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="\/brand\/icon-180\.png\?v=/)
    expect(html).not.toContain('data:image/svg')
    const favicon = await get(server, '/favicon.ico')
    expect([favicon.status, favicon.headers.get('content-type')]).toEqual([200, 'image/png'])
    // With its version in the address it can be kept for good; without, it is checked each time.
    expect((await fetch(server.url + shown.icon.small)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect((await get(server, '/brand/icon-32.png')).headers.get('cache-control')).toBe('no-cache')
  })

  it('shows a logo in place of the name, described by the name, and uses one logo for both modes until a second is given', async () => {
    const light = await put('logo-light', await imageBuffer({ width: 900, height: 300, format: 'png', seed: 5 }))
    expect(light.status).toBe(200)
    let html = await home()
    const images = () => [...html.matchAll(/<img class="fb-site-logo fb-site-logo--(light|dark)" src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]*)"/g)].map(match => match.slice(1))
    expect(images().map(image => image[0])).toEqual(['light', 'dark'])
    // 900 x 300 shown 40 pixels tall is 120 wide; the name is its description.
    expect(images().map(image => image.slice(2))).toEqual([['120', '40', 'Test Photos'], ['120', '40', 'Test Photos']])
    expect(images()[0]![1]).toBe(images()[1]![1])
    expect(html).not.toContain('>Test Photos</a>')
    // Stored at twice the tallest it can be shown, never enlarged.
    expect(await picture('/brand/logo-light.png')).toMatchObject({ format: 'png', width: 720, height: 240 })

    await put('logo-dark', await imageBuffer({ width: 400, height: 100, format: 'webp', seed: 6 }))
    html = await home()
    expect(images()[0]![1]).toContain('logo-light.png')
    expect(images()[1]![1]).toContain('logo-dark.png')
    expect(await picture('/brand/logo-dark.png')).toMatchObject({ format: 'png', width: 400, height: 100 })
    // The stylesheet shows the right one for the mode.
    const css = await (await get(server, '/skin.css')).text()
    expect(css).toContain('.fb-site-logo--dark { display: none; }')
    expect(css).toContain('[data-fb-mode="dark"] .fb-site-logo--dark { display: block; }')
  })

  it('shows the logo at the height the owner chose, within limits', async () => {
    const set = (logoHeight: unknown) => fetch(`${server.url}/api/admin/brand`, { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ logoHeight }) })
    expect((await (await set(80)).json() as { meta: { logoHeight: number } }).meta.logoHeight).toBe(80)
    expect(await home()).toMatch(/fb-site-logo--light" src="[^"]+" width="240" height="80"/)
    expect((await (await set(5000)).json() as { meta: { logoHeight: number } }).meta.logoHeight).toBe(120)
    expect((await (await set('huge')).json() as { meta: { logoHeight: number } }).meta.logoHeight).toBe(40)
    // A logo is never drawn larger than it is: the 100-pixel dark logo stays 100 tall at most.
    await set(120)
    expect(await home()).toMatch(/fb-site-logo--dark" src="[^"]+" width="400" height="100"/)
    await set(40)
  })

  it('refuses what is not a picture it can use, and says why', async () => {
    const svg = await put('icon', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', { 'content-type': 'image/svg+xml' })
    expect([svg.status, await message(svg)]).toEqual([422, 'Use a PNG, JPEG, or WebP picture. (SVG files are not accepted.)'])
    expect((await put('logo-light', 'just some text, long enough to have a beginning to look at')).status).toBe(422)
    // A file named and typed as a PNG that is not one.
    expect((await put('icon', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]))).status).toBe(422)
    const small = await put('icon', await imageBuffer({ width: 40, height: 40, format: 'png' }))
    expect([small.status, await message(small)]).toEqual([422, 'An icon needs to be at least 64 pixels on each side. 512 by 512 is a good size.'])
    const large = await put('icon', Buffer.alloc(5 * 1024 * 1024 + 1))
    expect(large.status).toBe(413)
    expect((await put('icon', '')).status).toBe(422)
    expect((await put('banner', await imageBuffer({ format: 'png' }))).status).toBe(404)
    // Nothing above changed what is stored.
    expect(await picture('/brand/icon-32.png')).toMatchObject({ width: 32 })
  })

  it('keeps only the pixels: what the camera recorded is not in the stored picture', async () => {
    await put('logo-light', await imageBuffer({ width: 600, height: 200, format: 'jpeg', exif: { Copyright: 'SECRET-OWNER-NOTE' } }), { 'content-type': 'image/jpeg' })
    const stored = Buffer.from(await (await fetch(`${server.url}/brand/logo-light.png`)).arrayBuffer())
    expect(stored.includes('SECRET-OWNER-NOTE')).toBe(false)
    expect((await sharp(stored).metadata()).exif).toBeUndefined()
  })

  it('goes back to the name as text and no icon when they are removed', async () => {
    for (const kind of ['icon', 'logo-light', 'logo-dark']) expect((await remove(kind)).status).toBe(200)
    const html = await home()
    expect(html).toContain('>Test Photos</a>')
    expect(html).not.toContain('fb-site-logo')
    expect(html).not.toMatch(/<link[^>]*rel="icon"/)
    expect((await get(server, '/brand/logo-light.png')).status).toBe(404)
  })

  it('serves only its own files, and needs a logged-in admin to change them', async () => {
    for (const name of ['..%2Ffotobogen.db', 'icon-64.png', 'logo-light.svg', 'secret']) expect((await get(server, `/brand/${name}`)).status, name).toBe(404)
    expect((await get(server, '/api/admin/brand')).status).toBe(401)
    const anonymous = await fetch(`${server.url}/api/admin/brand/icon`, { method: 'PUT', headers: { origin: server.url, 'content-type': 'image/png' }, body: await imageBuffer({ format: 'png' }) as BodyInit })
    expect(anonymous.status).toBe(401)
    expect((await fetch(`${server.url}/api/admin/brand/icon`, { method: 'DELETE', headers: { origin: server.url } })).status).toBe(401)
  })
})
