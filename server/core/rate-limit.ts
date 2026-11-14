// Counts failures per key (an IP address) inside a sliding window. In memory
// only: a restart clears it, which is acceptable for a single small server.

export interface FailureLimiter {
  isBlocked(key: string): boolean
  recordFailure(key: string): void
  clear(key: string): void
  /** Seconds until the key is unblocked; 0 when it is not blocked. */
  retryAfterSeconds(key: string): number
}

const DEFAULT_MAX_KEYS = 10_000

export function createFailureLimiter(options: { max: number, windowMs: number, now?: () => number, maxKeys?: number }): FailureLimiter {
  const { max, windowMs } = options
  const now = options.now ?? Date.now
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS
  const failures = new Map<string, number[]>()

  function recent(key: string): number[] {
    const cutoff = now() - windowMs
    const times = (failures.get(key) ?? []).filter(time => time > cutoff)
    if (times.length) failures.set(key, times)
    else failures.delete(key)
    return times
  }

  /**
   * Make room for a new key. Expired entries go first, then the oldest key
   * that is not blocked. A blocked key is never dropped: forgetting it would
   * hand an attacker a way to reset their own block by flooding the table.
   */
  function makeRoom(): boolean {
    if (failures.size < maxKeys) return true
    for (const key of [...failures.keys()]) recent(key)
    for (const [key, times] of failures) {
      if (failures.size < maxKeys) break
      if (times.length < max) failures.delete(key)
    }
    return failures.size < maxKeys
  }

  /** With every slot held by a blocked key, unknown keys are refused too. */
  const saturated = (key: string) => !failures.has(key) && !makeRoom()

  return {
    isBlocked: key => recent(key).length >= max || saturated(key),
    recordFailure(key) {
      if (!failures.has(key) && !makeRoom()) return
      failures.set(key, [...recent(key), now()])
    },
    clear: (key) => { failures.delete(key) },
    retryAfterSeconds(key) {
      const times = recent(key)
      if (times.length >= max) {
        const oldestCounted = times[times.length - max]!
        return Math.max(1, Math.ceil((oldestCounted + windowMs - now()) / 1000))
      }
      return saturated(key) ? Math.ceil(windowMs / 1000) : 0
    },
  }
}
