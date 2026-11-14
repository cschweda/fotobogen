// Counts failures per key (an IP address) inside a sliding window. In memory
// only: a restart clears it, which is acceptable for a single small server.

export interface FailureLimiter {
  isBlocked(key: string): boolean
  recordFailure(key: string): void
  clear(key: string): void
  /** Seconds until the key is unblocked; 0 when it is not blocked. */
  retryAfterSeconds(key: string): number
  /** How many keys are being tracked. */
  size(): number
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
   * Make room for one new key; only called when a failure for an unknown key
   * arrives and the table is full. Expired entries go first, then a key that
   * is not blocked. If every slot holds a live block, the block that would
   * end soonest is dropped: the table stays bounded, nobody without a record
   * is ever locked out, and the cost is that one address regains its
   * attempts slightly early.
   */
  function makeRoom(): void {
    for (const key of [...failures.keys()]) recent(key)
    if (failures.size < maxKeys) return

    let victim: string | undefined
    let victimBlocked = true
    let victimLatest = Infinity
    for (const [key, times] of failures) {
      const blocked = times.length >= max
      const latest = times[times.length - 1]!
      if ((victimBlocked && !blocked) || (blocked === victimBlocked && latest < victimLatest)) {
        victim = key
        victimBlocked = blocked
        victimLatest = latest
      }
    }
    if (victim !== undefined) failures.delete(victim)
  }

  return {
    isBlocked: key => recent(key).length >= max,
    recordFailure(key) {
      if (!failures.has(key) && failures.size >= maxKeys) makeRoom()
      failures.set(key, [...recent(key), now()])
    },
    clear: (key) => { failures.delete(key) },
    retryAfterSeconds(key) {
      const times = recent(key)
      if (times.length < max) return 0
      const oldestCounted = times[times.length - max]!
      return Math.max(1, Math.ceil((oldestCounted + windowMs - now()) / 1000))
    },
    size: () => failures.size,
  }
}
