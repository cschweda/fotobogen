import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

interface Received { event: string, body: string, signature: string, json: { event: string, site: string, photo: { slug: string, title: string | null, path: string, image: string | null } | null } }

describe('webhooks', () => {
  let receiver: Server
  let receiverUrl = ''
  const received: Received[] = []
  let answerWith = 200
  let server: TestServer
  let cookie: string
  let secret = ''
  let hookId = ''
  const send = (method: string, path: string, body?: unknown) => fetch(server.url + path, {
    method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const events = () => received.map(message => `${message.event}:${message.json.photo?.slug ?? '-'}`)
  const until = async (count: number) => {
    for (let tries = 0; tries < 100 && received.length < count; tries++) await new Promise(wait => setTimeout(wait, 50))
  }

  beforeAll(async () => {
    receiver = createServer((request, response) => {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        received.push({ event: String(request.headers['x-fotobogen-event']), body, signature: String(request.headers['x-fotobogen-signature']), json: JSON.parse(body) })
        response.writeHead(answerWith).end('ignored')
      })
    })
    await new Promise<void>(listening => receiver.listen(0, '127.0.0.1', listening))
    receiverUrl = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/hook`
    // The receiver is on this machine, which a site must opt in to.
    server = await startServer({ env: { WEBHOOKS_ALLOW_PRIVATE: '1' } })
    cookie = await completeSetup(server, { siteTitle: 'Hook Test' })
  })
  afterAll(async () => {
    await server.stop()
    await new Promise(closed => receiver.close(closed))
  })

  it('are added by a logged-in admin, with a secret shown once', async () => {
    expect((await get(server, '/api/admin/webhooks')).status).toBe(401)
    const invalid = await send('POST', '/api/admin/webhooks', { url: 'ftp://example.com', events: [] })
    expect(invalid.status).toBe(422)
    expect(Object.keys((await invalid.json() as { errors: object }).errors).sort()).toEqual(['events', 'url'])

    const created = await send('POST', '/api/admin/webhooks', { url: receiverUrl, events: ['photo.uploaded', 'photo.published', 'photo.deleted', 'made.up'] })
    expect(created.status).toBe(201)
    const hook = await created.json() as { id: string, secret: string, events: string[] }
    expect(hook.events).toEqual(['photo.uploaded', 'photo.published', 'photo.deleted'])
    expect(hook.secret.length).toBeGreaterThanOrEqual(32)
    secret = hook.secret
    hookId = hook.id
    const listed = await (await get(server, '/api/admin/webhooks', { cookie })).text()
    expect(listed).toContain(receiverUrl)
    expect(listed).not.toContain(secret)
  })

  it('send a signed test message on request', async () => {
    const delivery = await (await send('POST', `/api/admin/webhooks/${hookId}/test`)).json() as { ok: boolean, detail: string }
    expect(delivery).toMatchObject({ ok: true, detail: 'Answered 200' })
    const message = received.at(-1)!
    expect(message.json).toMatchObject({ event: 'test', site: 'Hook Test', photo: null })
    expect(message.signature).toBe(`sha256=${createHmac('sha256', secret).update(message.body).digest('hex')}`)
    received.length = 0
  })

  it('announce an upload, then the photo going live once it is processed', async () => {
    await upload(server, cookie, await imageBuffer({ seed: 1, width: 1600, height: 1000 }), 'harbour.jpg')
    await whenProcessed(server, cookie)
    await until(2)
    expect(events()).toEqual(['photo.uploaded:harbour', 'photo.published:harbour'])
    expect(received[1]!.json.photo).toMatchObject({ slug: 'harbour', path: '/photo/harbour' })
    expect(received[1]!.json.photo!.image).toMatch(/^\/media\/.+-medium-[0-9a-f]{8}\.webp$/)
    expect(received.every(message => message.signature === `sha256=${createHmac('sha256', secret).update(message.body).digest('hex')}`)).toBe(true)
    received.length = 0
  })

  it('announce a hidden photo being made public, but not other edits, and not a re-render', async () => {
    const { photos } = await (await get(server, '/api/admin/photos', { cookie })).json() as { photos: { id: string }[] }
    const id = photos[0]!.id
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'hidden' })
    await send('PATCH', `/api/admin/photos/${id}`, { title: 'Harbour at dawn' })
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'public' })
    await until(1)
    await send('PATCH', `/api/admin/photos/${id}`, { description: 'From the ferry.' })
    await send('PUT', `/api/admin/photos/${id}/recipe`, { recipe: [] })
    await whenProcessed(server, cookie)
    await new Promise(wait => setTimeout(wait, 300))
    expect(events()).toEqual(['photo.published:harbour'])
    expect(received[0]!.json.photo!.title).toBe('Harbour at dawn')
    received.length = 0

    // A photo scheduled for later is not announced until its time (checked once a minute).
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'hidden' })
    await send('PATCH', `/api/admin/photos/${id}`, { visibility: 'public', publishAt: Date.now() + 3_600_000 })
    await new Promise(wait => setTimeout(wait, 300))
    expect(events()).toEqual([])
    await send('PATCH', `/api/admin/photos/${id}`, { publishAt: null })
    await until(1)
    expect(events()).toEqual(['photo.published:harbour'])
    received.length = 0
  })

  it('announce a deletion, and tell only the webhooks that asked', async () => {
    const onlyDeletes = await (await send('POST', '/api/admin/webhooks', { url: receiverUrl + '?second', events: ['photo.deleted'] })).json() as { id: string }
    await upload(server, cookie, await imageBuffer({ seed: 2, width: 300, height: 200 }), 'gone.jpg')
    await whenProcessed(server, cookie)
    await until(2)
    expect(events()).toEqual(['photo.uploaded:gone', 'photo.published:gone']) // the second webhook heard nothing
    received.length = 0
    const { photos } = await (await get(server, '/api/admin/photos', { cookie })).json() as { photos: { id: string, filename: string }[] }
    await send('DELETE', `/api/admin/photos/${photos.find(photo => photo.filename === 'gone.jpg')!.id}`)
    await until(2)
    expect(events()).toEqual(['photo.deleted:gone', 'photo.deleted:gone']) // both
    expect(received[0]!.json.photo!.image).toBeNull()
    received.length = 0
    expect((await send('DELETE', `/api/admin/webhooks/${onlyDeletes.id}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/webhooks/${onlyDeletes.id}`)).status).toBe(404)
  })

  it('report a receiver that answers with an error, and try again', async () => {
    answerWith = 500
    const delivery = await (await send('POST', `/api/admin/webhooks/${hookId}/test`)).json() as { ok: boolean, detail: string }
    expect(delivery).toEqual({ at: expect.any(Number), event: 'test', ok: false, detail: 'Answered 500' })
    const listed = await (await get(server, '/api/admin/webhooks', { cookie })).json() as { webhooks: { last: { ok: boolean } }[] }
    expect(listed.webhooks[0]!.last.ok).toBe(false)
    received.length = 0
    await upload(server, cookie, await imageBuffer({ seed: 3, width: 300, height: 200 }), 'retry.jpg')
    // The first attempt fails; five seconds later it is tried again.
    await until(1)
    answerWith = 200
    const before = received.filter(message => message.event === 'photo.uploaded').length
    for (let tries = 0; tries < 160 && received.filter(message => message.event === 'photo.uploaded').length <= before; tries++) await new Promise(wait => setTimeout(wait, 50))
    expect(received.filter(message => message.event === 'photo.uploaded').length).toBeGreaterThan(before)
  }, 20_000)

  it('refuse an address on this machine unless the site has opted in', async () => {
    const strict = await startServer()
    try {
      const strictCookie = await completeSetup(strict)
      const response = await fetch(strict.url + '/api/admin/webhooks', {
        method: 'POST', headers: { origin: strict.url, cookie: strictCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: receiverUrl, events: ['photo.published'] }),
      })
      expect(response.status).toBe(422)
      expect((await response.json() as { errors: { url: string } }).errors.url).toContain('private network')
      const metadata = await fetch(strict.url + '/api/admin/webhooks', {
        method: 'POST', headers: { origin: strict.url, cookie: strictCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/', events: ['photo.published'] }),
      })
      expect(metadata.status).toBe(422)
    }
    finally {
      await strict.stop()
    }
  })
})
