import { spawn } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startFakePicsum, type FakePicsum } from '../helpers/picsum.ts'
import { baseEnv, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

// Not spawnSync: the stand-in for Lorem Picsum runs in this process and
// has to keep answering while the command runs.
function seedFetch(dataDir: string, baseUrl: string): Promise<{ code: number | null, out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/fotobogen.mjs', 'seed-fetch'], {
      env: { ...baseEnv(), DATA_DIR: dataDir, SAMPLES_BASE_URL: baseUrl },
    })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { out += chunk })
    child.on('exit', code => resolve({ code, out }))
  })
}

describe('pnpm seed:fetch', () => {
  let picsum: FakePicsum
  let server: TestServer
  beforeAll(async () => {
    picsum = await startFakePicsum()
    server = await startServer()
    await completeSetup(server)
  })
  afterAll(async () => {
    await server.stop()
    await picsum.stop()
  })

  it('downloads and processes the samples while the server is running', async () => {
    const result = await seedFetch(server.dataDir, picsum.url)
    expect(result.out).toContain('Sample photos: 25 added, 0 already there, 0 failed.')
    expect(result.code).toBe(0)
    expect(query(server, `select count(*) as ready from photos where is_sample = 1 and status = 'ready'`)).toEqual([{ ready: 25 }])
    expect(query(server, `select count(*) as thumbs from derivatives where kind = 'thumb'`)).toEqual([{ thumbs: 25 }])
  })

  it('skips what is already there when run again', async () => {
    const result = await seedFetch(server.dataDir, picsum.url)
    expect(result.out).toContain('Sample photos: 0 added, 25 already there, 0 failed.')
    expect(result.code).toBe(0)
  })

  it('fails with a plain message when Lorem Picsum cannot be reached', async () => {
    const fresh = await startServer()
    try {
      await completeSetup(fresh)
      const result = await seedFetch(fresh.dataDir, 'http://127.0.0.1:9')
      expect(result.code).toBe(1)
      expect(result.out).toContain('Some sample photos could not be downloaded.')
      expect(result.out).not.toMatch(/\n\s+at /)
    }
    finally {
      await fresh.stop()
    }
  })
})
