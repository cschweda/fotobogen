// Comparing version numbers such as "1.4.0" and "v1.10.2".

/** The three numbers of a version, or null when it is not one. Pre-release tags are not releases. */
export function parseVersion(text: unknown): [number, number, number] | null {
  if (typeof text !== 'string') return null
  const match = text.trim().match(/^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** True when `candidate` is a later version than `current`. False if either is not a plain version. */
export function isNewer(candidate: unknown, current: unknown): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!
  }
  return false
}
