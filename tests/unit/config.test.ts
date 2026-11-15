import { describe, expect, it } from 'vitest'
import { config, resolveSettings } from '../../server/core/config.ts'

describe('settings', () => {
  it('come from fotobogen.config.js when the environment says nothing', () => {
    expect(resolveSettings({})).toEqual({
      port: 5150, portIsExplicit: false, host: '0.0.0.0', dataDir: './data', trustProxy: false, demoMode: false, siteUrl: '', maxUploadMb: 50, maxMegapixels: 100, webhooksAllowPrivate: false,
    })
    expect(config.server.port).toBe(5150)
  })
  it('are overridden by the environment, which is where .env ends up', () => {
    expect(resolveSettings({ PORT: '8088', HOST: '127.0.0.1', DATA_DIR: '/srv/photos', TRUST_PROXY: '1', SITE_URL: 'https://photos.example.com/', MAX_UPLOAD_MB: '120', MAX_MEGAPIXELS: '60' })).toEqual({
      port: 8088, portIsExplicit: true, host: '127.0.0.1', dataDir: '/srv/photos', trustProxy: true, demoMode: false, siteUrl: 'https://photos.example.com', maxUploadMb: 120, maxMegapixels: 60, webhooksAllowPrivate: false,
    })
  })
  it('ignore values that make no sense, rather than starting on a broken setting', () => {
    for (const PORT of ['', 'eighty', '-1', '0', '70000', '80.5']) {
      expect(resolveSettings({ PORT }), PORT).toMatchObject({ port: 5150, portIsExplicit: false })
    }
    expect(resolveSettings({ MAX_UPLOAD_MB: 'lots', TRUST_PROXY: 'yes' })).toMatchObject({ maxUploadMb: 50, trustProxy: false })
    // Docker passes a setting that is not in .env as an empty value: that means "not set", not "on".
    expect(resolveSettings({ SITE_URL: '', DEMO_MODE: '', WEBHOOKS_ALLOW_PRIVATE: '' })).toMatchObject({ siteUrl: '', demoMode: false, webhooksAllowPrivate: false })
    // A site address is kept as its origin; anything that is not a web address counts as not set.
    expect(resolveSettings({ SITE_URL: 'photos.example.com' }).siteUrl).toBe('')
    expect(resolveSettings({ SITE_URL: 'javascript:alert(1)' }).siteUrl).toBe('')
    expect(resolveSettings({ SITE_URL: ' http://192.168.1.20:5150/admin ' }).siteUrl).toBe('http://192.168.1.20:5150')
  })
  it('keeps the values other code is built around in one place', () => {
    expect(config.internals.derivatives).toMatchObject({ thumbWidth: 480, squareSize: 480, mediumEdge: 1280, largeEdge: 2560 })
    expect(config.internals.auth).toEqual({ sessionDays: 30, maxFailures: 5, failureWindowMinutes: 15, passwordMinLength: 12 })
    expect(config.internals.queue.maxAttempts).toBe(3)
  })
})
