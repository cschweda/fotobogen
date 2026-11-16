// What the security audit of 16 November 2026 found and fixed, kept fixed.
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'

describe('hardening', () => {
  let server: TestServer
  let cookie: string
  beforeAll(async () => {
    server = await startServer({ env: { TRUST_PROXY: '1' } })
    cookie = await completeSetup(server)
  })
  afterAll(() => server.stop())

  it('refuses a percent-encoded spelling of a guarded address, whoever asks', async () => {
    for (const path of ['/api/%61dmin/settings', '/api/%73etup/verify', '/%73etup', '/%6cogin']) {
      expect((await get(server, path, { cookie })).status, path).toBe(400)
    }
    expect((await get(server, '/api/admin/settings', { cookie })).status).toBe(200)
  })

  it('answers a method no website needs with a refusal, not an error', async () => {
    const response = await fetch(server.url + '/', { method: 'TRACE' }).catch(() => null)
    // Some versions of the test's own fetch refuse to send TRACE at all; the server's answer is what matters when it is sent.
    if (response) expect(response.status).toBe(400)
    expect(server.output()).not.toContain('TypeError')
  })

  it('refuses a Host header that is not a site name', async () => {
    const http = await import('node:http')
    const status = await new Promise<number>((resolve, reject) => {
      const request = http.request(server.url + '/sitemap.xml', { headers: { host: 'a"<b>' } }, response => resolve(response.statusCode ?? 0))
      request.on('error', reject)
      request.end()
    })
    expect(status).toBe(400)
  })

  it('tells browsers and proxies never to keep what the admin and the login answer', async () => {
    for (const path of ['/api/admin/settings', '/api/auth/me', '/admin']) {
      expect((await get(server, path, { cookie })).headers.get('cache-control'), path).toBe('no-store')
    }
  })

  it('does not let a page loaded over http change a site reached over https', async () => {
    const host = new URL(server.url).host
    const send = (origin: string) => fetch(server.url + '/api/admin/tokens', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin, 'x-forwarded-proto': 'https' }, body: JSON.stringify({ name: 'x', scope: 'upload' }) })
    expect((await send(`http://${host}`)).status).toBe(403)
    expect((await send(`https://${host}`)).status).toBe(200)
  })

  it('does not take a token header as a reason to skip the same-site check outside the admin API', async () => {
    const response = await fetch(server.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer fb_x' }, body: JSON.stringify(ADMIN) })
    expect(response.status).toBe(403)
  })

  it.skipIf(process.platform === 'win32')('keeps the database and the uploaded files private to the user running the site', () => {
    expect(statSync(join(server.dataDir, 'fotobogen.db')).mode & 0o777).toBe(0o600)
    expect(statSync(join(server.dataDir, 'originals')).mode & 0o777).toBe(0o700)
  })

  it('refuses a WebP that declares more pixels than the limit, from its first bytes', async () => {
    // A small file whose header claims 16383 by 16383.
    const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).webp({ lossless: true }).toBuffer()
    const lying = Buffer.from(small)
    lying.writeUInt32LE((16382) | (16382 << 14), 21)
    const response = await upload(server, cookie, lying, 'huge.webp')
    expect(response.status).toBe(422)
    expect((await response.json() as { message: string }).message).toMatch(/268\.4 megapixels; the limit for WebP files is/)
  })

  it('keeps characters XML forbids out of the feed', async () => {
    const response = await upload(server, cookie, await imageBuffer({ seed: 3, width: 300, height: 200 }), 'feed.jpg')
    const { id } = (await response.json() as { photo: { id: string } }).photo
    await whenProcessed(server, cookie)
    const patched = await fetch(`${server.url}/api/admin/photos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie, origin: server.url }, body: JSON.stringify({ title: 'ctl \u0001\u0008\u000b x', description: 'vt \u000c \ufffe end' }) })
    expect(patched.status).toBe(200)
    const feed = await (await get(server, '/feed.xml')).text()
    expect(feed).toContain('ctl  x')
    // eslint-disable-next-line no-control-regex
    expect(feed).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe]/)
  })
})
