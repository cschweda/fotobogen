import { describe, expect, it } from 'vitest'
import { bearerToken, tokenAllows } from '../../server/utils/tokens.ts'

describe('what an API token may do', () => {
  const allowed = (scope: string, method: string, path: string) => tokenAllows(scope, method, path)

  it('lets an upload token upload, list, look, and retry, and nothing else', () => {
    for (const [method, path] of [['POST', '/api/admin/photos'], ['GET', '/api/admin/photos'], ['GET', '/api/admin/photos/abc123'], ['POST', '/api/admin/photos/abc123/retry']]) {
      expect(allowed('upload', method!, path!), `${method} ${path}`).toBe(true)
    }
    for (const [method, path] of [
      ['DELETE', '/api/admin/photos/abc123'], ['PATCH', '/api/admin/photos/abc123'], ['POST', '/api/admin/photos/bulk'], ['PUT', '/api/admin/photos/abc123/recipe'],
      ['GET', '/api/admin/albums'], ['GET', '/api/admin/settings'], ['GET', '/api/admin/backup'], ['PUT', '/api/admin/skins'],
    ]) expect(allowed('upload', method!, path!), `${method} ${path}`).toBe(false)
  })

  it('lets a manage token change photos and albums, and nothing about the site', () => {
    for (const [method, path] of [
      ['DELETE', '/api/admin/photos/abc123'], ['PATCH', '/api/admin/photos/abc123'], ['POST', '/api/admin/photos/bulk'], ['PUT', '/api/admin/photos/abc123/recipe'],
      ['POST', '/api/admin/albums'], ['DELETE', '/api/admin/albums/xyz'], ['GET', '/api/admin/overview'],
    ]) expect(allowed('manage', method!, path!), `${method} ${path}`).toBe(true)
    for (const [method, path] of [
      ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings'], ['PUT', '/api/admin/skins'], ['PUT', '/api/admin/site-text'], ['PUT', '/api/admin/seo'],
      ['GET', '/api/admin/backup'], ['POST', '/api/admin/restore'], ['PUT', '/api/admin/brand/icon'], ['POST', '/api/admin/webhooks'], ['PUT', '/api/admin/modules/filmlooks'],
      ['PUT', '/api/admin/site-recipe'], ['POST', '/api/admin/samples'], ['POST', '/api/admin/acknowledge'], ['POST', '/api/auth/logout'],
    ]) expect(allowed('manage', method!, path!), `${method} ${path}`).toBe(false)
  })

  it('never lets any token touch the tokens, and refuses a kind it does not know', () => {
    for (const scope of ['upload', 'manage']) {
      for (const [method, path] of [['GET', '/api/admin/tokens'], ['POST', '/api/admin/tokens'], ['DELETE', '/api/admin/tokens/abc']]) expect(allowed(scope, method!, path!)).toBe(false)
    }
    expect(allowed('full', 'GET', '/api/admin/photos')).toBe(false)
    expect(allowed('', 'GET', '/api/admin/photos')).toBe(false)
  })

  it('is exact about addresses: a near miss is refused', () => {
    for (const path of ['/api/admin/photosx', '/api/admin/photos/../settings', '/API/ADMIN/PHOTOS', '/api/admin/photos/abc/retry/extra', '/api/admin/albumsettings']) {
      expect(allowed('upload', 'POST', path), path).toBe(false)
    }
    expect(allowed('manage', 'GET', '/api/admin/photosx')).toBe(false)
    expect(allowed('manage', 'GET', '/api/admin/albumsettings')).toBe(false)
  })

  it('reads a token only from a well-formed Authorization header', () => {
    expect(bearerToken('Bearer fb_abcDEF-123_x')).toBe('fb_abcDEF-123_x')
    expect(bearerToken('bearer   fb_abc')).toBe('fb_abc')
    for (const header of [undefined, null, '', 'Basic fb_abc', 'Bearer abc', 'Bearer fb_abc def', 'fb_abc', 'Bearer fb_abc;x']) expect(bearerToken(header)).toBeNull()
  })
})
