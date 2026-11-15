// Decides which addresses a webhook may call, and makes the call. By
// default only addresses on the public internet are allowed, so a webhook
// cannot be used to reach this machine, the network behind it, or a cloud
// provider's metadata service.
//
// Two things matter and both are done here:
//   - every way of writing a private address is recognised, including IPv6
//     forms that wrap an IPv4 address;
//   - the address that is checked is the address that is connected to. The
//     name is looked up once, as part of connecting, and the connection is
//     refused there if the answer is private. A name cannot be pointed
//     somewhere else between the check and the call.
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const blocked = new BlockList()
// IPv4: this network, private, carrier-grade NAT, loopback, link-local
// (including cloud metadata), protocol assignments, benchmarking, multicast
// and reserved. Node applies these to IPv4-mapped IPv6 addresses
// (::ffff:a.b.c.d, in any spelling) as well.
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) blocked.addSubnet(network, prefix, 'ipv4')
// IPv6: unspecified and loopback, unique local, link-local, multicast, and
// the ranges that carry an IPv4 address inside them (IPv4-compatible,
// NAT64, 6to4, Teredo), which could otherwise smuggle a private one.
for (const [network, prefix] of [
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['2001::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(network, prefix, 'ipv6')

/** True for loopback, private, link-local, and other addresses that are not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true // not an address at all
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export type AddressCheck = { ok: true, url: URL } | { ok: false, message: string }

const PRIVATE = 'That address is on this machine or a private network. Webhooks may only call public addresses, unless WEBHOOKS_ALLOW_PRIVATE=1 is set.'

/** Checks the shape of a webhook address: http or https, a host, no login in it. */
export function parseWebhookUrl(raw: unknown): AddressCheck {
  if (typeof raw !== 'string' || raw.length > 2000) return { ok: false, message: 'Enter the address to call, starting with https://' }
  let url: URL
  try {
    url = new URL(raw.trim())
  }
  catch {
    return { ok: false, message: 'Enter the address to call, starting with https://' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, message: 'The address must start with https:// or http://' }
  if (url.username || url.password) return { ok: false, message: 'Leave the user name and password out of the address.' }
  return { ok: true, url }
}

type Resolve = (host: string) => Promise<string[]>
const resolveAll: Resolve = host => new Promise((done, reject) => {
  dnsLookup(host, { all: true }, (error, addresses) => error ? reject(error) : done(addresses.map(entry => entry.address)))
})

/**
 * For the form that adds a webhook: is this an address a webhook may have?
 * A courtesy to the person typing. The check that counts is made again, at
 * connection time, by `postJson`.
 */
export async function checkWebhookAddress(raw: unknown, allowPrivate: boolean, resolve: Resolve = resolveAll): Promise<AddressCheck> {
  const parsed = parseWebhookUrl(raw)
  if (!parsed.ok || allowPrivate) return parsed
  const host = parsed.url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : await resolve(host)
  }
  catch {
    return { ok: false, message: `The name ${host} could not be found.` }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return { ok: false, message: PRIVATE }
  return parsed
}

export type PostResult = { status: number } | { refused: string } | { failed: 'timeout' | 'unreachable' }

/**
 * POSTs a JSON body and reports only the status of the answer. Redirects
 * are not followed and the answer's body is never read. Unless private
 * addresses are allowed, the connection is made only to a public address:
 * the name is resolved here, once, and the socket connects to exactly what
 * was resolved.
 */
export function postJson(url: URL, headers: Record<string, string>, body: string, options: { allowPrivate: boolean, timeoutMs: number }): Promise<PostResult> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!options.allowPrivate && isIP(host) && isPrivateAddress(host)) return Promise.resolve({ refused: PRIVATE })

  // Called by the socket when it needs an address for the name.
  const guarded: LookupFunction = (hostname, lookupOptions, callback) => {
    dnsLookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) return callback(error, '', 0)
      const list = addresses as { address: string, family: number }[]
      if (list.length === 0 || (!options.allowPrivate && list.some(entry => isPrivateAddress(entry.address)))) {
        return callback(Object.assign(new Error(PRIVATE), { code: 'EFOTOBOGENPRIVATE' }), '', 0)
      }
      // Hand back what was checked, and nothing else.
      if ((lookupOptions as { all?: boolean }).all) (callback as unknown as (error: null, addresses: typeof list) => void)(null, list)
      else callback(null, list[0]!.address, list[0]!.family)
    })
  }

  return new Promise((done) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const request = send(url, {
      method: 'POST',
      headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
      lookup: guarded,
      timeout: options.timeoutMs,
      // One connection per message: nothing is kept open to be reused for another address.
      agent: false,
    }, (response) => {
      response.resume() // the answer's body is of no interest
      done({ status: response.statusCode ?? 0 })
    })
    const overall = setTimeout(() => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), options.timeoutMs)
    request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    request.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(overall)
      if (error.code === 'EFOTOBOGENPRIVATE') done({ refused: PRIVATE })
      else done({ failed: error.code === 'ETIMEDOUT' ? 'timeout' : 'unreachable' })
    })
    request.on('close', () => clearTimeout(overall))
    request.end(body)
  })
}
