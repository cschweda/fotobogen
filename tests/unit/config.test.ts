import { describe, expect, it } from 'vitest'
import { config, resolveSettings } from '../../server/core/config.ts'

describe('settings', () => {
  it('come from fotobogen.config.js when the environment says nothing', () => {
    expect(resolveSettings({})).toEqual({
      port: 5150, portIsExplicit: false, host: '0.0.0.0', dataDir: './data', trustProxy: false, maxUploadMb: 50, maxMegapixels: 100,
    })
    expect(config.server.port).toBe(5150)
  })
  it('are overridden by the environment, which is where .env ends up', () => {
    expect(resolveSettings({ PORT: '8088', HOST: '127.0.0.1', DATA_DIR: '/srv/photos', TRUST_PROXY: '1', MAX_UPLOAD_MB: '120', MAX_MEGAPIXELS: '60' })).toEqual({
      port: 8088, portIsExplicit: true, host: '127.0.0.1', dataDir: '/srv/photos', trustProxy: true, maxUploadMb: 120, maxMegapixels: 60,
    })
  })
  it('ignore values that make no sense, rather than starting on a broken setting', () => {
    for (const PORT of ['', 'eighty', '-1', '0', '70000', '80.5']) {
      expect(resolveSettings({ PORT }), PORT).toMatchObject({ port: 5150, portIsExplicit: false })
    }
    expect(resolveSettings({ MAX_UPLOAD_MB: 'lots', TRUST_PROXY: 'yes' })).toMatchObject({ maxUploadMb: 50, trustProxy: false })
  })
  it('keeps the values other code is built around in one place', () => {
    expect(config.internals.derivatives).toMatchObject({ thumbWidth: 480, squareSize: 480, mediumEdge: 1280, largeEdge: 2560 })
    expect(config.internals.auth).toEqual({ sessionDays: 30, maxFailures: 5, failureWindowMinutes: 15, passwordMinLength: 12 })
    expect(config.internals.queue.maxAttempts).toBe(3)
  })
})
