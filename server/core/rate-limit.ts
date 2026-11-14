// Counts failures per key (an IP address) inside a sliding window. In memory
// only: a restart clears it, which is acceptable for a single small server.

export interface FailureLimiter {
  isBlocked(key: string): boolean
  recordFailure(key: string): void
  clear(key: string): void
  /** Seconds until the key is unblocked; 0 when it is not blocked. */
  retryAfterSeconds(key: string): number
}

const MAX_KEYS = 10_000

export function createFailureLimiter(options: { max: number, windowMs: number, now?: () => number }): FailureLimiter {
  const { max, windowMs } = options
  const now = options.now ?? Date.now
  const failures = new Map<string, number[]>()

  function recent(key: string): number[] {
    const cutoff = now() - windowMs
    const times = (failures.get(key) ?? []).filter(time => time > cutoff)
    if (times.length) failures.set(key, times)
    else failures.delete(key)
    return times
  }

  function prune(): void {
    for (const key of [...failures.keys()]) recent(key)
    // Still full of live entries: drop the oldest keys rather than grow without bound.
    while (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value!)
  }

  return {
    isBlocked: key => recent(key).length >= max,
    recordFailure(key) {
      if (!failures.has(key) && failures.size >= MAX_KEYS) prune()
      failures.set(key, [...recent(key), now()])
    },
    clear: (key) => { failures.delete(key) },
    retryAfterSeconds(key) {
      const times = recent(key)
      if (times.length < max) return 0
      const oldestCounted = times[times.length - max]!
      return Math.max(1, Math.ceil((oldestCounted + windowMs - now()) / 1000))
    },
  }
}
