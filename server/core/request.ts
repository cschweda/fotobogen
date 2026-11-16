// Small, pure helpers for judging a request. Kept free of framework types so
// they can be tested directly.

/**
 * True for the names a browser uses for the computer it is running on, with
 * or without a port: localhost, the loopback addresses, and 0.0.0.0 (which
 * is what the server prints when it listens on every interface, and which a
 * browser on the same machine can open).
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.toLowerCase().replace(/:\d+$/, '')
  return ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '[::]'].includes(name)
}

/**
 * Whether a browser will keep the login cookie for a request that came this
 * way. The cookie is marked Secure everywhere except on this computer, so it
 * is kept over https, or at a local address; over plain http anywhere else
 * the browser throws it away, and logging in appears to do nothing.
 *
 * `forwardedProto` is the X-Forwarded-Proto header, if a proxy sent one. It
 * is believed here whether or not the proxy is trusted, because being wrong
 * only costs a helpful message.
 */
export function loginCanStick(host: string | undefined, protocol: string, forwardedProto: string | undefined): boolean {
  if (isLoopbackHost(host)) return true
  const scheme = forwardedProto?.split(',')[0]?.trim().toLowerCase() || protocol.replace(/:$/, '').toLowerCase()
  return scheme === 'https'
}

/**
 * A mutating request must come from a page on this site: its Origin header's
 * host (and port) must equal the Host header, and it must be a web page's
 * origin (http or https). A TLS-terminating proxy hides the request's own
 * scheme from the app; when the app does know the request came over https
 * (`secure`), a page loaded over plain http is not this site either.
 */
export function originMatchesHost(origin: string | undefined, host: string | undefined, secure = false): boolean {
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !secure)) return false
    return url.host.toLowerCase() === host.toLowerCase()
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

/** A Host header is a name or an address, with or without a port, and nothing else. */
export function isValidHost(host: string): boolean {
  return /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:\d{1,5})?$/i.test(host) && host.length <= 255
}

/**
 * The admin, its API, setup, and login are found by their paths, so those
 * paths are only accepted spelled plainly. A percent-encoded spelling
 * (/api/%61dmin/...) reaches the same handler but would slip past a check
 * made on the text of the path. Returns false for a path to refuse.
 */
export function isPlainGuardedPath(pathname: string): boolean {
  if (!pathname.includes('%')) return true
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  }
  catch {
    return false
  }
  return !/^\/+(api|admin|setup|login)(\/|$)/i.test(decoded)
}
