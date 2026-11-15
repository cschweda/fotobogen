import { describe, expect, it } from 'vitest'
import { clientIpFrom, isLoopbackHost, loginCanStick, originMatchesHost, rateLimitKey } from '../../server/core/request.ts'
import { newId } from '../../server/core/ids.ts'

describe('originMatchesHost', () => {
  it.each([
    ['https://a.com', 'a.com', true],
    ['http://localhost:3000', 'localhost:3000', true],
    ['https://A.com', 'a.com', true],
    ['https://evil.com', 'a.com', false],
    ['https://a.com:8443', 'a.com', false],
    [undefined, 'a.com', false],
    ['null', 'a.com', false],
    ['https://a.com', undefined, false],
  ])('%s against %s is %s', (origin, host, expected) => {
    expect(originMatchesHost(origin, host)).toBe(expected)
  })
})

describe('clientIpFrom', () => {
  it('ignores X-Forwarded-For unless the proxy is trusted', () => {
    expect(clientIpFrom('10.0.0.1', '1.2.3.4, 5.6.7.8', false)).toBe('10.0.0.1')
  })
  it('takes the last forwarded address when the proxy is trusted', () => {
    expect(clientIpFrom('10.0.0.1', '1.2.3.4, 5.6.7.8', true)).toBe('5.6.7.8')
  })
  it('falls back to the socket address when no header is present', () => {
    expect(clientIpFrom('10.0.0.1', undefined, true)).toBe('10.0.0.1')
    expect(clientIpFrom(undefined, undefined, false)).toBe('unknown')
  })
})

describe('isLoopbackHost', () => {
  it.each(['localhost', 'localhost:3000', '127.0.0.1:8080', '[::1]:3000', 'LOCALHOST'])('%s is loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(true)
  })
  it.each(['example.com', 'localhost.evil.com', '127.0.0.1.evil.com', '', undefined])('%s is not loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(false)
  })
})

describe('newId', () => {
  it('is 12 URL-safe characters and not repeated', () => {
    expect(newId()).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(newId()).not.toBe(newId())
  })
})

describe('rateLimitKey', () => {
  it.each([
    ['1.2.3.4', '1.2.3.4'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['2001:DB8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['unknown', 'unknown'],
  ])('%s is counted as %s', (ip, key) => {
    expect(rateLimitKey(ip)).toBe(key)
  })
})

describe('whether a browser will keep the login', () => {
  it('does at any name for this computer, over plain http', () => {
    // 0.0.0.0 is the address the server prints when it listens on every interface.
    for (const host of ['localhost:5150', '127.0.0.1:5150', '[::1]:5150', '0.0.0.0:5150', '[::]:5151', 'LOCALHOST']) {
      expect(isLoopbackHost(host), host).toBe(true)
      expect(loginCanStick(host, 'http:', undefined), host).toBe(true)
    }
  })
  it('does over https anywhere, including behind a proxy that says so', () => {
    expect(loginCanStick('photos.example.com', 'https:', undefined)).toBe(true)
    expect(loginCanStick('photos.example.com', 'http:', 'https')).toBe(true)
    expect(loginCanStick('photos.example.com', 'http:', 'https, http')).toBe(true)
  })
  it('does not over plain http at any other address', () => {
    for (const host of ['192.168.1.20:5150', 'my-mac.local:5150', 'photos.example.com', '10.0.0.5', undefined]) {
      expect(loginCanStick(host, 'http:', undefined), String(host)).toBe(false)
      expect(loginCanStick(host, 'http:', 'http'), String(host)).toBe(false)
    }
    expect(isLoopbackHost('0.0.0.0.example.com')).toBe(false)
    expect(isLoopbackHost('localhost.example.com')).toBe(false)
  })
})

