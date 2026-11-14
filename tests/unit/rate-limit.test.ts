import { describe, expect, it } from 'vitest'
import { createFailureLimiter } from '../../server/core/rate-limit.ts'

const make = () => {
  let now = 1_000_000
  const limiter = createFailureLimiter({ max: 5, windowMs: 15 * 60_000, now: () => now })
  return { limiter, advance: (ms: number) => { now += ms } }
}

describe('createFailureLimiter', () => {
  it('blocks after five failures, not four', () => {
    const { limiter } = make()
    for (let i = 0; i < 4; i++) limiter.recordFailure('1.1.1.1')
    expect(limiter.isBlocked('1.1.1.1')).toBe(false)
    limiter.recordFailure('1.1.1.1')
    expect(limiter.isBlocked('1.1.1.1')).toBe(true)
  })
  it('lifts the block once the window has passed', () => {
    const { limiter, advance } = make()
    for (let i = 0; i < 5; i++) limiter.recordFailure('k')
    advance(15 * 60_000 - 1)
    expect(limiter.isBlocked('k')).toBe(true)
    expect(limiter.retryAfterSeconds('k')).toBe(1)
    advance(2)
    expect(limiter.isBlocked('k')).toBe(false)
    expect(limiter.retryAfterSeconds('k')).toBe(0)
  })
  it('keeps keys independent', () => {
    const { limiter } = make()
    for (let i = 0; i < 5; i++) limiter.recordFailure('a')
    expect(limiter.isBlocked('b')).toBe(false)
  })
  it('clear removes the count', () => {
    const { limiter } = make()
    for (let i = 0; i < 5; i++) limiter.recordFailure('a')
    limiter.clear('a')
    expect(limiter.isBlocked('a')).toBe(false)
  })
})

describe('createFailureLimiter when its table is full', () => {
  const full = (maxKeys: number) => createFailureLimiter({ max: 2, windowMs: 60_000, now: () => 1, maxKeys })

  it('never forgets a blocked key to make room', () => {
    const limiter = full(2)
    for (const key of ['a', 'b']) { limiter.recordFailure(key); limiter.recordFailure(key) }
    limiter.recordFailure('c')
    expect(limiter.isBlocked('a')).toBe(true)
    expect(limiter.isBlocked('b')).toBe(true)
  })

  it('treats an untracked key as blocked while every slot holds a blocked key', () => {
    const limiter = full(2)
    for (const key of ['a', 'b']) { limiter.recordFailure(key); limiter.recordFailure(key) }
    expect(limiter.isBlocked('newcomer')).toBe(true)
    expect(limiter.retryAfterSeconds('newcomer')).toBeGreaterThan(0)
  })

  it('makes room by dropping a key that is not blocked', () => {
    const limiter = full(2)
    limiter.recordFailure('a')
    limiter.recordFailure('b'); limiter.recordFailure('b')
    limiter.recordFailure('c'); limiter.recordFailure('c')
    expect(limiter.isBlocked('b')).toBe(true)
    expect(limiter.isBlocked('c')).toBe(true)
  })
})
