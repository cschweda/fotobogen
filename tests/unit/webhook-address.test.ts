import { describe, expect, it } from 'vitest'
import { checkWebhookAddress, isPrivateAddress, parseWebhookUrl } from '../../server/core/webhook-address.ts'

const resolvesTo = (...addresses: string[]) => async () => addresses

describe('webhook addresses', () => {
  it('knows which addresses are not on the public internet', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-address',
      // IPv6 spellings that carry a private IPv4 address inside them.
      '::ffff:7f00:1', '::ffff:a00:1', '0:0:0:0:0:ffff:c0a8:0101', '::7f00:1', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2002:c0a8:101::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', 'fec0::1', 'febf::1', 'fdff::1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
    for (const address of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('accepts only http and https addresses with no login in them', () => {
    expect(parseWebhookUrl('https://example.com/hooks/fotobogen')).toMatchObject({ ok: true })
    expect(parseWebhookUrl(' http://example.com:8080/x ')).toMatchObject({ ok: true })
    for (const bad of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'example.com/hook', '', 42, 'https://user:pass@example.com/', `https://example.com/${'x'.repeat(2100)}`]) {
      expect(parseWebhookUrl(bad).ok, String(bad).slice(0, 40)).toBe(false)
    }
  })

  it('refuses a name that leads to this machine or a private network, however it is written', async () => {
    const refused = async (url: string, ...addresses: string[]) => (await checkWebhookAddress(url, false, resolvesTo(...addresses))).ok
    expect(await refused('https://hooks.example.com/x', '93.184.216.34')).toBe(true)
    expect(await refused('https://hooks.example.com/x', '10.0.0.5')).toBe(false)
    // One private address among several is enough to refuse.
    expect(await refused('https://hooks.example.com/x', '93.184.216.34', '127.0.0.1')).toBe(false)
    expect(await refused('http://127.0.0.1:8080/x')).toBe(false)
    expect(await refused('http://[::1]/x')).toBe(false)
    expect(await refused('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(await refused('https://localhost/x', '127.0.0.1')).toBe(false)
    expect(await refused('https://nothing.example.com/x')).toBe(false) // resolves to nothing
  })

  it('says why, and allows private addresses only when that has been switched on', async () => {
    const refused = await checkWebhookAddress('http://192.168.1.20/hook', false)
    expect(refused).toEqual({ ok: false, message: 'That address is on this machine or a private network. Webhooks may only call public addresses, unless WEBHOOKS_ALLOW_PRIVATE=1 is set.' })
    expect((await checkWebhookAddress('http://192.168.1.20/hook', true)).ok).toBe(true)
    const unknown = await checkWebhookAddress('https://no-such-host.invalid/x', false, async () => { throw new Error('ENOTFOUND') })
    expect(unknown).toEqual({ ok: false, message: 'The name no-such-host.invalid could not be found.' })
  })
})

describe('calling a webhook', () => {
  it('connects only to the address it checked: a name that resolves to this machine is refused at connection time', async () => {
    const { createServer } = await import('node:http')
    const { postJson } = await import('../../server/core/webhook-address.ts')
    let reached = 0
    const server = createServer((_request, response) => { reached++; response.writeHead(204).end() })
    await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
    const { port } = server.address() as { port: number }
    try {
      // "localhost" is a name, not an address, so only the connection-time check can catch it.
      const byName = await postJson(new URL(`http://localhost:${port}/hook`), {}, '{}', { allowPrivate: false, timeoutMs: 3000 })
      expect(byName).toEqual({ refused: expect.stringContaining('private network') })
      const byAddress = await postJson(new URL(`http://127.0.0.1:${port}/hook`), {}, '{}', { allowPrivate: false, timeoutMs: 3000 })
      expect(byAddress).toEqual({ refused: expect.stringContaining('private network') })
      const mapped = await postJson(new URL(`http://[::ffff:7f00:1]:${port}/hook`), {}, '{}', { allowPrivate: false, timeoutMs: 3000 })
      expect(mapped).toEqual({ refused: expect.stringContaining('private network') })
      expect(reached).toBe(0)
      // Allowed when the site has opted in.
      expect(await postJson(new URL(`http://localhost:${port}/hook`), {}, '{}', { allowPrivate: true, timeoutMs: 3000 })).toEqual({ status: 204 })
      expect(reached).toBe(1)
    }
    finally {
      await new Promise(closed => server.close(closed))
    }
  })

  it('does not follow a redirect, and gives up on a receiver that never answers', async () => {
    const { createServer } = await import('node:http')
    const { postJson } = await import('../../server/core/webhook-address.ts')
    let followed = false
    const server = createServer((request, response) => {
      if (request.url === '/redirect') response.writeHead(302, { location: '/elsewhere' }).end()
      else if (request.url === '/elsewhere') { followed = true; response.writeHead(200).end() }
      // "/silent": never answers
    })
    await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
    const { port } = server.address() as { port: number }
    try {
      expect(await postJson(new URL(`http://127.0.0.1:${port}/redirect`), {}, '{}', { allowPrivate: true, timeoutMs: 3000 })).toEqual({ status: 302 })
      expect(followed).toBe(false)
      expect(await postJson(new URL(`http://127.0.0.1:${port}/silent`), {}, '{}', { allowPrivate: true, timeoutMs: 300 })).toEqual({ failed: 'timeout' })
      expect(await postJson(new URL('http://127.0.0.1:9/nobody-home'), {}, '{}', { allowPrivate: true, timeoutMs: 3000 })).toEqual({ failed: 'unreachable' })
    }
    finally {
      server.closeAllConnections()
      await new Promise(closed => server.close(closed))
    }
  })
})
