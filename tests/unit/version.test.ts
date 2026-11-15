import { describe, expect, it } from 'vitest'
import { isNewer, parseVersion } from '../../server/core/version.ts'

describe('versions', () => {
  it('are three numbers, with or without a leading v', () => {
    expect(parseVersion('1.4.0')).toEqual([1, 4, 0])
    expect(parseVersion(' v2.10.3 ')).toEqual([2, 10, 3])
    for (const bad of ['1.4', '1.4.0-beta.1', 'latest', '', 'v1.x.0', 14, null]) expect(parseVersion(bad), String(bad)).toBeNull()
  })
  it('are compared number by number, not as text', () => {
    expect(isNewer('1.10.0', '1.9.9')).toBe(true)
    expect(isNewer('2.0.0', '1.99.99')).toBe(true)
    expect(isNewer('1.0.1', '1.0.0')).toBe(true)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isNewer('0.9.0', '1.0.0')).toBe(false)
  })
  it('never call a pre-release or nonsense newer', () => {
    expect(isNewer('2.0.0-rc.1', '1.0.0')).toBe(false)
    expect(isNewer('banana', '1.0.0')).toBe(false)
    expect(isNewer('2.0.0', 'banana')).toBe(false)
  })
})
