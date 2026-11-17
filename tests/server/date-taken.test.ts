import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { get, startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

/** A small photo carrying these fields in its camera data, as a camera, a scanner, or an editor writes them. */
const photo = (colour: string, exif: Record<string, Record<string, string>> | null) => {
  const image = sharp({ create: { width: 400, height: 300, channels: 3, background: colour } }).jpeg()
  return (exif ? image.withExif(exif) : image).toBuffer()
}

describe('the date a photo was taken', () => {
  let server: TestServer
  let cookie: string
  const taken: Record<string, number | null> = {}
  beforeAll(async () => {
    // A server whose clock is not on UTC, as most are not: the date must not move with it.
    server = await startServer({ env: { TZ: 'America/Chicago' } })
    cookie = await completeSetup(server)
    const files: [string, Record<string, Record<string, string>> | null][] = [
      ['evening', { IFD2: { DateTimeOriginal: '2019:07:04 22:30:00', DateTimeDigitized: '2019:07:09 08:00:00' } }],
      ['scanned', { IFD2: { DateTimeDigitized: '2001:12:31 23:59:00' } }],
      ['edited', { IFD0: { DateTime: '2024:01:01 12:00:00' } }],
      ['bare', null],
    ]
    for (const [index, [name, exif]] of files.entries()) await upload(server, cookie, await photo(`rgb(${index * 60}, 90, 120)`, exif), `${name}.jpg`)
    const { photos } = await whenProcessed(server, cookie)
    for (const listed of photos) {
      const detail = await (await get(server, `/api/admin/photos/${listed.id}`, { cookie })).json() as { takenAt: number | null }
      taken[listed.slug] = detail.takenAt
    }
  })
  afterAll(() => server.stop())

  it('is read from the file, as the day and time the camera wrote, wherever the server is', async () => {
    expect(taken.evening).toBe(Date.UTC(2019, 6, 4, 22, 30, 0))
    // What the public page and the admin's date field then show: the fourth, not the fifth.
    expect(new Date(taken.evening!).toISOString().slice(0, 10)).toBe('2019-07-04')
    expect(await (await get(server, '/api/photos/evening')).json()).toMatchObject({ takenAt: Date.UTC(2019, 6, 4, 22, 30, 0) })
  })

  it('falls back to when the file was made, for a scan or an app that wrote no more', () => {
    expect(taken.scanned).toBe(Date.UTC(2001, 11, 31, 23, 59, 0))
  })

  it('is left empty, for the owner to fill in, when the file says only when it was edited or says nothing', () => {
    expect(taken.edited).toBeNull()
    expect(taken.bare).toBeNull()
  })
})
