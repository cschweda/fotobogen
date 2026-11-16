import { copyFileSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The pm2 file as pm2 would read it from a folder holding this .env (or none). */
function pm2File(env: string | null) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'fb-pm2-')))
  copyFileSync('ecosystem.config.cjs', join(folder, 'ecosystem.config.cjs'))
  if (env !== null) writeFileSync(join(folder, '.env'), env)
  const app = createRequire(import.meta.url)(join(folder, 'ecosystem.config.cjs')).apps[0]
  return { app, folder }
}

describe('the pm2 process file', () => {
  it('runs one copy on port 5150, reachable only from the server itself, when nothing says otherwise', () => {
    const { app, folder } = pm2File(null)
    expect(app).toMatchObject({ name: 'fotobogen', instances: 1, cwd: folder })
    expect(app.env).toMatchObject({ PORT: 5150, HOST: '127.0.0.1', TRUST_PROXY: '1', DATA_DIR: join(folder, 'data') })
  })

  it('uses the port in .env, so the answer given at the first start (or to `fotobogen init`) is the one pm2 runs on', () => {
    expect(pm2File('# mine\nSITE_URL=https://photos.example.com\nPORT=5177\nDEMO_MODE=1\n').app.env.PORT).toBe(5177)
    expect(pm2File('PORT=5178\r\nDEMO_MODE=1\r\n').app.env.PORT).toBe(5178)
  })

  it('keeps 5150 when .env does not set a port, or sets one that cannot be used', () => {
    for (const env of ['', '# PORT=5177\n', 'PORT=\n', 'PORT=abc\n', 'PORT=70000\n', 'REPORT=5177\n']) expect(pm2File(env).app.env.PORT).toBe(5150)
  })

  it('leaves the other settings to .env, which Fotobogen reads itself when it starts', () => {
    const { app } = pm2File('DEMO_MODE=1\nSITE_URL=https://photos.example.com\n')
    expect(app.env).not.toHaveProperty('DEMO_MODE')
    expect(app.env).not.toHaveProperty('SITE_URL')
  })
})
