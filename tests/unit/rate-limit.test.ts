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
  const make = (maxKeys: number) => {
    let now = 1
    const limiter = createFailureLimiter({ max: 2, windowMs: 60_000, now: () => now, maxKeys })
    const block = (key: string) => { limiter.recordFailure(key); limiter.recordFailure(key) }
    return { limiter, block, tick: () => { now += 1000 } }
  }

  it('makes room by dropping a key that is not blocked before any blocked one', () => {
    const { limiter, block } = make(2)
    limiter.recordFailure('a')
    block('b')
    block('c')
    expect(limiter.isBlocked('b')).toBe(true)
    expect(limiter.isBlocked('c')).toBe(true)
  })

  it('never blocks a visitor it has no record of', () => {
    const { limiter, block } = make(2)
    block('a')
    block('b')
    expect(limiter.isBlocked('newcomer')).toBe(false)
    expect(limiter.retryAfterSeconds('newcomer')).toBe(0)
  })

  it('when every slot is blocked, drops only the block that would end soonest', () => {
    const { limiter, block, tick } = make(2)
    block('oldest')
    tick()
    block('newer')
    tick()
    limiter.recordFailure('c')
    expect(limiter.isBlocked('newer')).toBe(true)
    expect(limiter.isBlocked('oldest')).toBe(false)
  })

  it('never holds more keys than its limit', () => {
    const { limiter, block } = make(3)
    for (let i = 0; i < 50; i++) block(`k${i}`)
    expect(limiter.size()).toBe(3)
  })
})
