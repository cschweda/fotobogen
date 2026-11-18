// `fotobogen import <folder>`: bring a folder of photos into a running site.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imageBuffer, withEmbeddedText } from '../helpers/images.ts'
import { whenProcessed } from '../helpers/photos.ts'
import { baseEnv, get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup, query } from '../helpers/setup.ts'

function cli(dataDir: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ['scripts/fotobogen.mjs', ...args], { env: { ...baseEnv(), DATA_DIR: dataDir, ...env }, encoding: 'utf8' })
  return { code: result.status, out: result.stdout + result.stderr }
}

describe('fotobogen import', () => {
  let server: TestServer
  let cookie: string
  let folder: string
  const albums = async () => (await (await get(server, '/api/admin/albums', { cookie })).json() as { albums: { title: string, count: number }[] }).albums.map(album => [album.title, album.count]).sort()
  const tokens = () => query(server, 'select name from api_tokens')

  beforeAll(async () => {
    server = await startServer()
    cookie = await completeSetup(server)
    folder = mkdtempSync(join(tmpdir(), 'fb-import-'))
    mkdirSync(join(folder, 'Iceland 2023'))
    mkdirSync(join(folder, '.thumbnails'))
    writeFileSync(join(folder, 'green-bicycle.jpg'), await imageBuffer({ seed: 1, width: 600, height: 400 }))
    writeFileSync(join(folder, 'Iceland 2023', 'falls.JPG'), withEmbeddedText(await imageBuffer({ seed: 2, width: 600, height: 400 }), { xmp: { title: 'Skógafoss', keywords: ['waterfall'] } }))
    copyFileSync('tests/fixtures/iphone.heic', join(folder, 'Iceland 2023', 'IMG_0042.HEIC'))
    // What is not a photo, or not meant to be found, is left alone.
    writeFileSync(join(folder, 'notes.txt'), 'not a photo')
    writeFileSync(join(folder, '.hidden.jpg'), await imageBuffer({ seed: 3 }))
    writeFileSync(join(folder, '.thumbnails', 'thumb.jpg'), await imageBuffer({ seed: 4 }))
    writeFileSync(join(folder, 'broken.jpg'), 'this only claims to be a photo')
    const outside = mkdtempSync(join(tmpdir(), 'fb-outside-'))
    writeFileSync(join(outside, 'elsewhere.jpg'), await imageBuffer({ seed: 5 }))
    try { symlinkSync(join(outside, 'elsewhere.jpg'), join(folder, 'link.jpg')) }
    catch { /* Windows without the right to make links: nothing to skip */ }
  })
  afterAll(() => server.stop())

  it('uploads every photo in the folder and the folders inside it, waits for them, and reports what it could not take', async () => {
    const result = cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(result.out).toContain('3 added, 0 already in the library, 1 refused')
    expect(result.out).toMatch(/broken\.jpg: This file is not a photo Fotobogen can read/)
    expect(result.out).not.toMatch(/notes\.txt|hidden|thumb\.jpg|elsewhere/)
    expect(result.code).toBe(1) // something was refused
    const { photos } = await whenProcessed(server, cookie)
    expect(photos.map(photo => [photo.filename, photo.status]).sort()).toEqual([['IMG_0042.HEIC', 'ready'], ['falls.JPG', 'ready'], ['green-bicycle.jpg', 'ready']])
    // The words inside a file come with it, as for any upload.
    expect(query(server, `select title from photos where original_filename = 'falls.JPG'`)).toEqual([{ title: 'Skógafoss' }])
    // The pass it made for itself is gone again.
    expect(tokens()).toEqual([])
  })

  it('skips what is already in the library when run again', () => {
    const result = cli(server.dataDir, ['import', folder, '--url', server.url])
    expect(result.out).toContain('0 added, 3 already in the library, 1 refused')
    expect(query(server, 'select count(*) as photos from photos')).toEqual([{ photos: 3 }])
  })

  it('makes an album of each folder inside, or puts everything in one album, photos already here included', async () => {
    expect(cli(server.dataDir, ['import', folder, '--url', server.url, '--albums']).out).toContain('Album "Iceland 2023": 2 photos')
    expect(await albums()).toEqual([['Iceland 2023', 2]])
    expect(cli(server.dataDir, ['import', folder, '--url', server.url, '--album', 'Everything']).out).toContain('Album "Everything": 3 photos')
    // The same album is used again, not made twice.
    cli(server.dataDir, ['import', folder, '--url', server.url, '--albums'])
    expect(await albums()).toEqual([['Everything', 3], ['Iceland 2023', 2]])
    expect(tokens()).toEqual([])
  })

  it('says plainly when the site is not running, or is not the site this data folder belongs to', async () => {
    const stopped = cli(server.dataDir, ['import', folder, '--url', 'http://127.0.0.1:9'])
    expect(stopped.code).toBe(1)
    expect(stopped.out).toContain('Fotobogen is not running at http://127.0.0.1:9')
    expect(tokens()).toEqual([])

    const other = await startServer()
    try {
      await completeSetup(other)
      const wrong = cli(server.dataDir, ['import', folder, '--url', other.url])
      expect(wrong.code).toBe(1)
      expect(wrong.out).toContain('is not the site whose data is in')
      expect(query(other, 'select count(*) as photos from photos')).toEqual([{ photos: 0 }])
    }
    finally { await other.stop() }
    expect(tokens()).toEqual([])
  })

  it('needs a folder that exists, and an address on this machine unless told otherwise', () => {
    expect(cli(server.dataDir, ['import']).out).toContain('Usage: fotobogen import <folder>')
    expect(cli(server.dataDir, ['import', join(folder, 'no-such-folder'), '--url', server.url]).out).toContain('is not a folder')
    const far = cli(server.dataDir, ['import', folder, '--url', 'https://photos.example.com'])
    expect(far.code).toBe(1)
    expect(far.out).toContain('only talks to a site on this machine')
    expect(tokens()).toEqual([])
  })
})
