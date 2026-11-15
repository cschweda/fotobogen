// Decides whether a webhook may call an address. By default only addresses
// on the public internet are allowed, so a webhook cannot be used to reach
// this machine, the network behind it, or a cloud provider's metadata
// service.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** True for loopback, private, link-local, and other addresses that are not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1]!)
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89ab]/.test(lower) || lower.startsWith('ff')
  }
  return true // not an address at all
}

export type AddressCheck = { ok: true, url: URL } | { ok: false, message: string }

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

/**
 * Looks the host up and refuses it if any of its addresses is private,
 * unless private addresses have been allowed. Done again before every
 * delivery, because a name can be pointed somewhere else later.
 */
export async function checkWebhookAddress(raw: unknown, allowPrivate: boolean, resolve = lookup): Promise<AddressCheck> {
  const parsed = parseWebhookUrl(raw)
  if (!parsed.ok || allowPrivate) return parsed
  const host = parsed.url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : (await resolve(host, { all: true })).map(entry => entry.address)
  }
  catch {
    return { ok: false, message: `The name ${host} could not be found.` }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return { ok: false, message: 'That address is on this machine or a private network. Webhooks may only call public addresses, unless WEBHOOKS_ALLOW_PRIVATE=1 is set.' }
  }
  return parsed
}
