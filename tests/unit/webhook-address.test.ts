import { describe, expect, it } from 'vitest'
import { checkWebhookAddress, isPrivateAddress, parseWebhookUrl } from '../../server/core/webhook-address.ts'

const resolvesTo = (...addresses: string[]) => (async () => addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 }))) as never

describe('webhook addresses', () => {
  it('knows which addresses are not on the public internet', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-address']) {
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
    const unknown = await checkWebhookAddress('https://no-such-host.invalid/x', false, (async () => { throw new Error('ENOTFOUND') }) as never)
    expect(unknown).toEqual({ ok: false, message: 'The name no-such-host.invalid could not be found.' })
  })
})
