import { describe, expect, it } from 'vitest'
import { resolveSettings } from '../../server/core/config.ts'
import { demoAllows } from '../../server/utils/demo.ts'

describe('demo mode', () => {
  it('is off unless the server switches it on', () => {
    expect(resolveSettings({}).demoMode).toBe(false)
    expect(resolveSettings({ DEMO_MODE: '1' }).demoMode).toBe(true)
    for (const value of ['0', 'true', 'yes', '']) expect(resolveSettings({ DEMO_MODE: value }).demoMode, value).toBe(false)
  })

  it('lets a demo visitor read the admin\'s pages of settings and photos', () => {
    for (const path of ['overview', 'system', 'settings', 'site-text', 'seo', 'brand', 'skins', 'modules', 'albums', 'samples', 'updates', 'photos', 'photos/abc123', 'albums/xyz']) {
      expect(demoAllows('GET', `/api/admin/${path}`), path).toBe('yes')
    }
    // Trying a look draws a preview and saves nothing.
    expect(demoAllows('POST', '/api/admin/photos/abc123/preview')).toBe('yes')
  })

  it('refuses every request that would change something', () => {
    const changes: [string, string][] = [
      ['POST', 'photos'], ['PATCH', 'photos/abc'], ['DELETE', 'photos/abc'], ['POST', 'photos/bulk'], ['POST', 'photos/abc/move'], ['PUT', 'photos/abc/recipe'], ['POST', 'photos/abc/retry'],
      ['POST', 'albums'], ['PATCH', 'albums/x'], ['DELETE', 'albums/x'], ['PUT', 'settings'], ['PUT', 'site-text'], ['PUT', 'seo'], ['PUT', 'skins'], ['PUT', 'modules/filmlooks'],
      ['PUT', 'site-recipe'], ['PUT', 'brand'], ['PUT', 'brand/icon'], ['DELETE', 'brand/icon'], ['POST', 'samples'], ['DELETE', 'samples'], ['POST', 'updates'],
      ['POST', 'tokens'], ['DELETE', 'tokens/x'], ['POST', 'webhooks'], ['DELETE', 'webhooks/x'], ['PUT', 'restore'], ['DELETE', 'restore'], ['POST', 'acknowledge'],
      // A preview is allowed only at its own address.
      ['POST', 'photos/abc/preview/extra'], ['PUT', 'photos/abc/preview'],
    ]
    for (const [method, path] of changes) expect(demoAllows(method, `/api/admin/${path}`), `${method} ${path}`).toBe('changes')
  })

  it('keeps the backup, tokens, and webhooks out of sight, and anything not named', () => {
    for (const path of ['backup', 'tokens', 'webhooks', 'webhooks/abc', 'restore', 'something-new', 'photos/abc/original', 'settings/extra', 'photosx']) {
      expect(demoAllows('GET', `/api/admin/${path}`), path).toBe('hidden')
    }
  })
})
