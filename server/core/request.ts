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
