// Small, pure helpers for judging a request. Kept free of framework types so
// they can be tested directly.

/** True for localhost and loopback addresses, with or without a port. */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.toLowerCase().replace(/:\d+$/, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

/**
 * A mutating request must come from a page on this site: its Origin header's
 * host (and port) must equal the Host header. The scheme is ignored because
 * a TLS-terminating proxy hides it from the app.
 */
export function originMatchesHost(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  }
  catch {
    return false
  }
}

/**
 * The visitor's address. X-Forwarded-For is believed only when the app is
 * known to sit behind its own proxy (TRUST_PROXY=1); the proxy appends the
 * real peer address, so the last entry is the trustworthy one.
 */
export function clientIpFrom(socketAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string {
  if (trustProxy && forwardedFor) {
    const last = forwardedFor.split(',').map(part => part.trim()).filter(Boolean).pop()
    if (last) return last
  }
  return socketAddress || 'unknown'
}

/**
 * What the failure limiter counts against. One IPv6 customer usually holds a
 * whole /64, so counting single addresses would let them rotate freely;
 * IPv6 is grouped by its /64 prefix. IPv4 addresses are counted singly.
 */
export function rateLimitKey(ip: string): string {
  const address = ip.toLowerCase()
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]!
  if (!address.includes(':')) return address

  const [head = '', tail] = address.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const groups = tail === undefined
    ? headParts
    : [...headParts, ...Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill('0'), ...tailParts]
  if (groups.length !== 8) return address
  return groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}
