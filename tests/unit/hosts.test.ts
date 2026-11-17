import { describe, expect, it } from 'vitest'
import { adminHostProblem, adminOrigin, rulingFor } from '../../server/core/hosts.ts'
import { isLoopbackHost } from '../../server/core/request.ts'

const hosts = { adminHost: 'admin.photos.example.com', siteUrl: 'https://photos.example.com' }
const ask = (host: string, path: string, method = 'GET') => rulingFor(hosts, { host, method, path })
const ADMIN = 'admin.photos.example.com'
const SITE = 'photos.example.com'

describe('an admin at its own address', () => {
  it('is reached at the site\'s scheme and the admin\'s host', () => {
    expect(adminOrigin(hosts)).toBe('https://admin.photos.example.com')
    expect(adminOrigin({ adminHost: 'admin.localhost:5150', siteUrl: 'http://localhost:5150' })).toBe('http://admin.localhost:5150')
  })

  it('serves the admin, the login, setup, and their API only at the admin\'s address', () => {
    for (const path of ['/admin', '/admin/photos/abc', '/login', '/setup', '/api/admin/settings', '/api/auth/login', '/api/auth/me', '/api/setup/verify']) {
      expect(ask(ADMIN, path), path).toEqual({ do: 'serve' })
    }
    // Asked for at the public address, a page is sent on to the admin's; the API simply is not there.
    expect(ask(SITE, '/admin/photos/abc?x=1')).toEqual({ do: 'redirect', to: 'https://admin.photos.example.com/admin/photos/abc?x=1' })
    expect(ask(SITE, '/login')).toEqual({ do: 'redirect', to: 'https://admin.photos.example.com/login' })
    expect(ask(SITE, '/LOGIN')).toMatchObject({ do: 'redirect' })
    for (const [path, method] of [['/api/admin/settings', 'GET'], ['/api/admin/photos', 'POST'], ['/api/auth/login', 'POST'], ['/api/auth/me', 'GET'], ['/api/setup/complete', 'POST'], ['/admin', 'POST'], ['/API/Admin/settings', 'GET']] as const) {
      expect(ask(SITE, path, method), `${method} ${path}`).toMatchObject({ do: 'refuse' })
    }
  })

  it('serves the public pages only at the site\'s address', () => {
    for (const path of ['/', '/photo/harbour', '/albums', '/feed.xml', '/sitemap.xml', '/robots.txt', '/slideshow']) expect(ask(SITE, path), path).toEqual({ do: 'serve' })
    expect(ask(ADMIN, '/photo/harbour?from=x')).toEqual({ do: 'redirect', to: 'https://photos.example.com/photo/harbour?from=x' })
    expect(ask(ADMIN, '/feed.xml')).toEqual({ do: 'redirect', to: 'https://photos.example.com/feed.xml' })
    // The admin's own front door.
    expect(ask(ADMIN, '/')).toEqual({ do: 'redirect', to: 'https://admin.photos.example.com/admin' })
    expect(ask(ADMIN, '/photo/harbour', 'POST')).toMatchObject({ do: 'refuse' })
  })

  it('serves what both need at both: pictures, built files, the public API, the health check', () => {
    for (const path of ['/media/abc-thumb-12345678.webp', '/brand/icon.png', '/skin.css', '/_nuxt/entry.js', '/api/photos', '/api/site', '/api/health', '/favicon.ico', '/api/_nuxt_icon/x.json', '/__nuxt_error']) {
      expect(ask(ADMIN, path), path).toEqual({ do: 'serve' })
      expect(ask(SITE, path), path).toEqual({ do: 'serve' })
    }
  })

  it('treats any other name the server answers to as the public site, never as the admin', () => {
    expect(ask('www.photos.example.com', '/admin')).toMatchObject({ do: 'redirect' })
    expect(ask('ADMIN.photos.example.com', '/admin')).toEqual({ do: 'serve' })
    expect(ask('admin.photos.example.com:8443', '/api/admin/settings')).toMatchObject({ do: 'refuse' })
  })

  it('needs the site\'s own address too, and the two must differ', () => {
    expect(adminHostProblem('', '')).toBeNull()
    expect(adminHostProblem('admin.photos.example.com', 'https://photos.example.com')).toBeNull()
    expect(adminHostProblem('admin.photos.example.com', '')).toMatch(/SITE_URL/)
    expect(adminHostProblem('photos.example.com', 'https://photos.example.com')).toMatch(/different/)
    expect(adminHostProblem('https://admin.photos.example.com', 'https://photos.example.com')).toMatch(/name only/)
    expect(adminHostProblem('admin photos', 'https://photos.example.com')).toMatch(/name only/)
  })
})

describe('names for this computer', () => {
  it('include any name ending in .localhost, which browsers treat as this computer', () => {
    expect(isLoopbackHost('admin.fb.localhost:5150')).toBe(true)
    expect(isLoopbackHost('photos.localhost')).toBe(true)
    expect(isLoopbackHost('localhost.evil.com')).toBe(false)
    expect(isLoopbackHost('notlocalhost')).toBe(false)
  })
})
